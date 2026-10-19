import * as THREE from 'three';
import { CANAL } from './data.js';
import { MOON_DIR } from './sky.js';
import { box, mesh } from './kit.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0b1016);
export const FOG_DENSITY = 0.0017;

/* ------------------------------------------------------------------ reflections */

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
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.6);
    // what actually reads in the water is the light: prefer the emissive map
    const showMap = src.emissiveMap || src.map || null;
    if (src.emissiveMap) c.setRGB(1, 1, 1).multiplyScalar(0.66);
    // the emissive sheets are alpha-cut, so the mirror can blend over the water
    // instead of adding up: stacked additive copies blew out at grazing angles
    const m = new THREE.MeshBasicMaterial({
      color: c, map: showMap, transparent: true,
      opacity: src.emissiveMap ? 0.8 : 0.46,
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
          transformed.x += (sin(transformed.y*0.22 + wt*1.6) + sin(transformed.z*0.3 - wt*1.0)) * 0.5 * uRipple;
          transformed.z += (sin(transformed.y*0.18 - wt*1.2) + sin(transformed.x*0.26 + wt*1.8)) * 0.42 * uRipple;
        `);
      // a 40 m tower mirror has to dissolve before it reaches the canal bed
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-46.0, -1.2, vWorldPosition.y) * 0.92 + 0.08;
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
    // one program per source material: these clones differ in defines (map or not,
    // vertex colours or not), so they must not share a cache key
    m.customProgramCacheKey = () => `biji-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/** mirrored copy of a source group under the water plane */
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
      // a mesh with geometry groups carries an array of materials — read `.map`
      // off that array and you get Array.prototype.map instead of a texture
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

/* ------------------------------------------------------------------ light columns */

/** additive light columns dragged down the water under every lamp */
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
          float wob = sin(wp.z*0.16 + uTime*1.8) * 0.7 + sin(wp.x*0.2 - uTime*1.25) * 0.5;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.9;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.7 + 0.3*sin(uTime*2.6 + wp.x*0.5 + wp.z*0.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.08, vUv.y);
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
  add(pos, color, width = 1.2, depth = 14, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(),
      base: new THREE.Color(color),
      tint: intensity,
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
  setColor(i, color, intensity = 1) {
    if (i < 0 || !this.items[i]) return;
    const it = this.items[i];
    it.tint = intensity;
    it.color.copy(color).multiplyScalar(intensity);
    this.colorDirty = true;
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
      // start the column just above the surface: at grazing angles the water is
      // opaque enough to swallow a column that begins below it
      d.position.set(it.pos.x, WATER_Y + 0.12, it.pos.z);
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

/* ------------------------------------------------------------------ banks and quay */

/** 条石驳岸 — the vertical wall both banks are faced with */
function quayWall(xMin, xMax, zc, depth, topY) {
  return box(xMax - xMin, topY + 4, depth, (xMin + xMax) / 2, -4, zc);
}

/** 埠头 — a set of stone steps running down into the water */
function steps(x, zStart, yTop, yBottom, count, width = 3.4) {
  const parts = [];
  const rise = (yTop - yBottom) / count;
  const tread = 0.85;
  for (let i = 0; i < count; i++) {
    const y = yTop - i * rise;
    parts.push(box(width, rise, tread, x, y - rise, zStart + i * tread));
  }
  // cheek walls so the flight reads as built, not as stacked planks
  for (const s of [-1, 1]) {
    parts.push(box(0.5, yTop - yBottom + 0.4, count * 0.85 + 0.6, x + s * (width / 2 + 0.25), yBottom - 0.4, zStart + (count * 0.85) / 2 - 0.3));
  }
  return parts;
}

/* ------------------------------------------------------------------ the canal */

export function buildCanal(scene) {
  const near = CANAL.nearZ, far = CANAL.farZ;
  const xSpan = CANAL.xMax - CANAL.xMin;
  const geo = new THREE.PlaneGeometry(xSpan, far - near, 40, 26);
  geo.rotateX(-Math.PI / 2);

  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#01060a') },
    uShallow: { value: new THREE.Color('#0b1c26') },
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
        float h = sin(p.x*0.055 + uTime*0.6)*0.30 + sin(p.y*0.075 - uTime*0.45)*0.26
                + sin((p.x+p.y)*0.14 + uTime*1.1)*0.10;
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
        vec3 col = mix(vec3(0.0042,0.0058,0.0135), vec3(0.010,0.013,0.028), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.3,0.0,1.0), 2.2);
        float town = smoothstep(0.30, -0.90, d.z)*0.8 + smoothstep(0.5, -0.9, d.x)*0.55;
        col += vec3(0.020,0.012,0.007) * haze * (0.3 + town * 0.8);
        col += vec3(0.012,0.020,0.030) * pow(max(0.0, dot(d, uMoon)), 44.0);
        return mix(col, vec3(0.0024,0.0030,0.0060), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // fine chop aliases into moiré from the far bank, so it fades with distance
        float det = clamp(1.0 - length(cameraPosition - vW) / 150.0, 0.0, 1.0);
        float dx = cos(p.x*0.055 + t*0.6)*0.055*0.30 + cos((p.x+p.y)*0.14 + t*1.1)*0.14*0.10;
        float dz = cos(p.y*0.075 - t*0.45)*0.075*0.26 + cos((p.x+p.y)*0.14 + t*1.1)*0.14*0.10;
        float c1 = sin(p.x*1.35 + t*2.0) * sin(p.y*1.15 - t*1.6);
        float c2 = sin(p.x*2.5 - t*2.6 + p.y*1.7) * 0.6;
        dx += (c1*1.35 + c2*2.5) * 0.010 * uRipple * det;
        dz += (cos(p.x*1.05 - t*1.5)*1.05*0.9 + c2*1.7) * 0.010 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple*3.2, 1.0, -dz*uRipple*3.2));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.28*fres);
        // the near mirror already carries the lane; the water only tints it
        col = mix(col, skyAt(normalize(r)) * 0.72, 0.06 + 0.40*fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.58, 0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.44,0.46,0.56) * pow(ndh, 260.0) * (0.35 + lane*1.5) * det;
        col += vec3(0.16,0.17,0.22) * pow(ndh, 42.0) * (0.10 + lane*0.5);

        float sparkle = pow(max(0.0, sin(p.x*4.2 + t*2.6) * sin(p.y*3.4 - t*2.0)), 13.0);
        col += vec3(0.24,0.24,0.26) * sparkle * 0.12 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.012 + vec2(t*0.014, -t*0.018)).r;
        col *= 0.92 + nsh*0.16;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        // looking down you see into dark water; at grazing angles the surface lets
        // the mirror through, which is where a canal reflection actually lives
        float a = clamp(0.50 + 0.26 * (1.0 - fres) + f * 0.40, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.set((CANAL.xMin + CANAL.xMax) / 2, WATER_Y, (near + far) / 2);
  water.renderOrder = 3;
  water.name = 'biji-canal';
  scene.add(water);

  /* ---------------- the bank the lane stands on */
  const quay = new THREE.Group();
  quay.name = 'quay';
  const stoneParts = [];
  const wetParts = [];
  const coping = [];

  // 本岸 驳岸 wall face, and its wet band down to the water
  stoneParts.push(quayWall(CANAL.xMin, CANAL.xMax, near - 2, 4, CANAL.wallTop));
  wetParts.push(box(CANAL.xMax - CANAL.xMin, 1.5, 0.6, (CANAL.xMin + CANAL.xMax) / 2, -0.9, near + 0.15, null));
  // 河坝 — the paved platform between the wall and the back yards
  stoneParts.push(box(CANAL.xMax - CANAL.xMin, 0.5, 10, (CANAL.xMin + CANAL.xMax) / 2, CANAL.quayTopY - 0.5, 0));
  coping.push(box(CANAL.xMax - CANAL.xMin, 0.22, 0.5, (CANAL.xMin + CANAL.xMax) / 2, CANAL.wallTop, near + 0.9));
  // 对岸
  stoneParts.push(quayWall(CANAL.xMin, CANAL.xMax, far + 2.4, 4.8, CANAL.wallTop + 0.4, null));
  stoneParts.push(box(CANAL.xMax - CANAL.xMin, 0.5, 26, (CANAL.xMin + CANAL.xMax) / 2, CANAL.wallTop - 0.1, far + 18));
  coping.push(box(CANAL.xMax - CANAL.xMin, 0.22, 0.5, (CANAL.xMin + CANAL.xMax) / 2, CANAL.wallTop + 0.4, far + 0.6));

  // 埠头 — three flights of steps down to the water on this side
  for (const x of [-84, -30, 12]) {
    stoneParts.push(...steps(x, near - 1.2, CANAL.quayTopY - 0.4, -0.5, 5));
  }
  // 系缆桩
  for (const x of [-34, -26, 8, 16, 52, 60]) {
    stoneParts.push(box(0.34, 0.9, 0.34, x, CANAL.quayTopY - 0.5, near - 1.6));
  }

  quay.add(mesh(stoneParts, stoneMat()));
  quay.add(mesh(wetParts, wetStoneMat()));
  quay.add(mesh(coping, stoneWarmMat()));

  // 栏杆 along the quay edge between the steps
  const rail = [];
  for (let x = CANAL.xMin + 6; x < CANAL.xMax - 6; x += 2.2) {
    if ([[-36, -22], [6, 20], [50, 64]].some(([a, b]) => x > a && x < b)) continue;
    rail.push(box(0.2, 0.95, 0.2, x, CANAL.wallTop, near + 1.8));
  }
  rail.push(box(CANAL.xMax - CANAL.xMin, 0.16, 0.34, 0, CANAL.wallTop + 0.95, near + 1.8));
  quay.add(mesh(rail, stoneWarmMat()));

  scene.add(quay);

  /* ---------------- ground under the lane and behind the houses */
  const ground = mesh([
    box(560, 2.6, 90, 0, -0.4, -34),         // the whole west bank block
    box(560, 4.2, 120, 0, -0.4, 104),        // the far bank inland
  ], groundMat());
  ground.name = 'ground';
  scene.add(ground);

  return {
    water, quay, uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/* material shorthands so buildCanal does not depend on init order */
const mem = new Map();
function cached(key, make) { return mem.has(key) ? mem.get(key) : (mem.set(key, make()), mem.get(key)); }
const stoneMat = () => cached('stone', () => new THREE.MeshStandardMaterial({ color: 0x6b6f74, map: T.stoneCourses(), roughness: 0.9, metalness: 0.02 }));
const wetStoneMat = () => cached('wet', () => new THREE.MeshStandardMaterial({ color: 0x2c3a34, roughness: 0.28, metalness: 0.3 }));
const stoneWarmMat = () => cached('stoneWarm', () => new THREE.MeshStandardMaterial({ color: 0x8a8274, map: T.stoneCourses('#9b9282'), roughness: 0.82 }));
const groundMat = () => cached('ground', () => new THREE.MeshStandardMaterial({ color: 0x161a21, map: T.paving('#242830', 6), roughness: 0.94 }));
