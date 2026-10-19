/**
 * 两方水面：砚池（塔东）与塔影池（塔西）。
 * 与晏溪河那版的差别只在形状——这里不是沿 X 展开的长条，而是两块矩形洼地，
 * 所以 shader 里的"离岸距离"要按矩形算（先求各轴超出量，再取大者）。
 * 倒影镜像面在 y = WATER_Y，地坪把不在池子上的倒影挡住，正好当遮罩用。
 */
import * as THREE from 'three';
import { lit } from '../../src/kit.js';
import { PONDS, WATER_Y, GROUND_Y } from './data.js';
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
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.5);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: src.map || null, transparent: true, opacity: 0.52,
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
          transformed.x += (sin(transformed.y*0.32 + wt*1.7) + sin(transformed.z*0.51 - wt*1.1)) * 0.17 * uRipple;
          transformed.z += (sin(transformed.y*0.27 - wt*1.3) + sin(transformed.x*0.44 + wt*1.9)) * 0.13 * uRipple;
        `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-40.0, -1.0, vWorldPosition.y) * 0.9 + 0.1;
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
    m.customProgramCacheKey = () => 'wenbi-wobble';
    this.cache.set(key, m);
    return m;
  }
}

/**
 * 镜像源。大地面（地坪、道路、山坡）不要 add 进来，否则倒影里多出一张巨大染色平面。
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
      // 倒影必须画在水面之后：水的 renderOrder 是 3，压在它下面就被 84% 的不透明度糊掉了
      o.renderOrder = 6;
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
  constructor(scene) {
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
                             + right * wob * uRipple * t * 0.8;
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
          float a = m * fade * vFlick * uStrength;
          gl_FragColor = vec4(vCol * uDepth, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 700);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3).fill(1), 3);
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

function poolMaterial(moonDir, pond) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: moonDir.clone() },
    // (中心x, 中心z, 半宽x, 半宽z)
    uRect: { value: new THREE.Vector4(
      (pond.x0 + pond.x1) / 2, (pond.z0 + pond.z1) / 2,
      (pond.x1 - pond.x0) / 2, (pond.z1 - pond.z0) / 2,
    ) },
    uDeep: { value: new THREE.Color('#01050b') },
    uShallow: { value: new THREE.Color('#05101d') },
    uNoise: { value: T.noise() },
  };
  return new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.21 + uTime*0.9)*0.08 + sin(p.y*0.17 - uTime*0.65)*0.10
                + sin((p.x+p.y)*0.33 + uTime*1.5)*0.045;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec4 uRect; uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.009,0.020), vec3(0.013,0.018,0.042), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        float warm = smoothstep(-0.3,0.9, d.x*0.7 - d.z*0.25);
        col += vec3(0.024,0.011,0.004) * haze * (0.35 + 0.9*warm);
        col += vec3(0.022,0.026,0.040) * pow(max(0.0,dot(d,uMoon)), 30.0);
        return mix(col, vec3(0.003,0.004,0.008), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 110.0, 0.0, 1.0);
        float dx = cos(p.x*0.21 + t*0.9)*0.21*0.08 + cos((p.x+p.y)*0.33 + t*1.5)*0.33*0.045;
        float dz = cos(p.y*0.17 - t*0.65)*0.17*0.10 + cos((p.x+p.y)*0.33 + t*1.5)*0.33*0.045;
        float c1 = sin(p.x*1.7 + t*2.6) * sin(p.y*1.3 - t*2.1);
        float c2 = sin(p.x*3.1 - t*3.4 + p.y*2.2) * 0.6;
        dx += (c1*1.7 + c2*3.1) * 0.015 * uRipple * det;
        dz += (cos(p.x*1.3 - t*1.9)*1.3*0.9 + c2*2.2) * 0.015 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple*0.9, 1.0, -dz*uRipple*0.9));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.22*fres);
        col = mix(col, skyAt(normalize(r)) * 0.42, 0.12 + 0.34*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        float lane = smoothstep(0.55, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 380.0) * (0.5 + lane*1.5);
        col += vec3(0.15,0.19,0.29) * pow(ndh, 55.0) * (0.12 + lane*0.5);

        float sparkle = pow(max(0.0, sin(p.x*7.3 + t*3.1) * sin(p.y*6.1 - t*2.4)), 12.0);
        col += vec3(0.22,0.24,0.28) * sparkle * 0.03 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.014 + vec2(t*0.02, -t*0.03)).r;
        col *= 0.95 + nsh*0.1;

        // 离岸越近越油黑：矩形用两轴超出量取大者
        float ex = max(abs(p.x - uRect.x) - uRect.z, 0.0);
        float ez = max(abs(p.y - uRect.y) - uRect.w, 0.0);
        float dist = max(ex, ez);
        col *= 1.0 - smoothstep(2.6, 0.0, dist) * 0.26;
        // 岸上的灯火只留薄薄一层暖回照，给多了整方池子像稀泥汤
        float near = smoothstep(uRect.z, uRect.z - 8.0, abs(p.x - uRect.x))
                   * smoothstep(uRect.w, uRect.w - 7.0, abs(p.y - uRect.y));
        col += vec3(0.055,0.028,0.011) * near * 0.16;

        float a = clamp(0.88 + fres*0.10, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
}

/** 两块池水 + 石驳岸 + 压顶 + 池底；edges 给 props 当石灯位 */
export function buildPools(scene, moonDir = MOON_DIR) {
  const stone = {
    bed: new THREE.MeshStandardMaterial({ color: new THREE.Color('#131c17'), roughness: 0.98 }),
    wall: lit('#8e94a2', { map: T.stone('#787f8c'), rough: 0.94, emissive: '#0b0d12', ei: 0.3 }),
    coping: lit('#a2a8b4', { map: T.stone('#8a9098'), rough: 0.9 }),
  };
  const pools = [];
  const edges = [];
  const bottom = WATER_Y - 0.8;
  const wallH = GROUND_Y + 0.1 - bottom;
  const yWall = (bottom + GROUND_Y + 0.1) / 2;
  const t = 0.9;

  for (const pond of PONDS) {
    const w = pond.x1 - pond.x0, d = pond.z1 - pond.z0;
    const cx = (pond.x0 + pond.x1) / 2, cz = (pond.z0 + pond.z1) / 2;

    const mat = poolMaterial(moonDir, pond);
    const geo = new THREE.PlaneGeometry(w - 0.6, d - 0.6,
      Math.max(24, Math.round(w / 1.6)), Math.max(20, Math.round(d / 1.6)));
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, WATER_Y, cz);
    mesh.renderOrder = 3;
    mesh.name = `pool-${pond.id}`;
    scene.add(mesh);

    // 不铺池底：倒影是"塔身镜像"，底一板就把镜像整个挡在水面之下
    // （晏溪河那版同理：河面以下不能有第二张不透明面）

    // 驳岸压在池子矩形外侧：[宽, 深, x, z, 压顶外挑方向]
    const runs = [
      [w + 2 * t, t, cx, pond.z0 - t / 2, 1],
      [w + 2 * t, t, cx, pond.z1 + t / 2, -1],
      [t, d, pond.x0 - t / 2, cz, 1],
      [t, d, pond.x1 + t / 2, cz, -1],
    ];
    for (const [bw, bd, bx, bz, outward] of runs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, wallH, bd), stone.wall);
      wall.position.set(bx, yWall, bz);
      wall.receiveShadow = true;
      scene.add(wall);
      const coping = new THREE.Mesh(
        new THREE.BoxGeometry(bw + (bw > bd ? 0.8 : 0.4), 0.24, bd + (bw > bd ? 0.4 : 0.8)),
        stone.coping,
      );
      coping.position.set(bx, GROUND_Y + 0.22, bz + outward * 0.1);
      coping.castShadow = coping.receiveShadow = true;
      scene.add(coping);
      const along = bw > bd ? 'x' : 'z';
      const len = along === 'x' ? bw : bd;
      const steps = Math.floor(len / 9 / 2);
      for (let s = -steps; s <= steps; s++) {
        edges.push(along === 'x' ? [bx + s * 9, bz + outward * 1.1] : [bx + outward * 1.1, bz + s * 9]);
      }
    }
    pools.push({ pond, mesh, uniforms: mat.uniforms });
  }
  return {
    pools,
    edges,
    meshes: pools.map((p) => p.mesh),
    update(t, ripple) {
      for (const p of pools) {
        p.uniforms.uTime.value = t;
        p.uniforms.uRipple.value = ripple;
      }
    },
  };
}
