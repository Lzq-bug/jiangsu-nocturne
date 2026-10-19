import * as THREE from 'three';
import { RIVER, INLET, STREET } from './data.js';
import { MOON_DIR } from './sky.js';
import { box, mesh } from './kit.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0a1016);
export const FOG_DENSITY = 0.0016;

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
    // additive copies stacked up and blew out at grazing angles, so the mirror blends
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
      // a 20 m wide mirror has to dissolve before it reaches the river bed
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-30.0, -1.2, vWorldPosition.y) * 0.92 + 0.08;
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
    m.customProgramCacheKey = () => `luzhi-wobble-${key}`;
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
    this.items[i].color.copy(color).multiplyScalar(intensity);
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
      // start just above the surface: at grazing angles the water swallows a column
      // that begins below it
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

/* ------------------------------------------------------------------ water shader */

function waterMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#01060a') },
    uShallow: { value: new THREE.Color('#0a1a24') },
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
        // fine chop aliases into moiré from far away, so it fades with distance
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
        // the near mirror already carries the town; the water only tints it
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
        // the mirror through, which is where a river reflection actually lives
        float a = clamp(0.50 + 0.26 * (1.0 - fres) + f * 0.40, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/* ------------------------------------------------------------------ banks, quay, ground */

/** 条石驳岸 — the vertical wall a bank is faced with */
function quayWall(len, zc, depth, topY, xCenter = 0) {
  return box(len, topY + 4, depth, xCenter, -4, zc);
}

/** 埠头 — a flight of stone steps down into the water */
function steps(x, zStart, dirZ, yTop, yBottom, count, width = 3.2) {
  const parts = [];
  const rise = (yTop - yBottom) / count;
  const tread = 0.85;
  for (let i = 0; i < count; i++) {
    const y = yTop - i * rise;
    parts.push(box(width, rise, tread, x, y - rise, zStart + dirZ * i * tread));
  }
  for (const s of [-1, 1]) {
    parts.push(box(0.5, yTop - yBottom + 0.4, count * tread + 0.6,
      x + s * (width / 2 + 0.25), yBottom - 0.4, zStart + dirZ * (count * tread) / 2 - dirZ * 0.3));
  }
  return parts;
}

/* material shorthands so the builder does not depend on init order */
const mem = new Map();
function cached(key, make) { return mem.has(key) ? mem.get(key) : (mem.set(key, make()), mem.get(key)); }
const stoneMat = () => cached('stone', () => new THREE.MeshStandardMaterial({ color: 0x6b6f74, map: T.stoneCourses(), roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide }));
const wetStoneMat = () => cached('wet', () => new THREE.MeshStandardMaterial({ color: 0x2c3a34, roughness: 0.28, metalness: 0.3 }));
const stoneWarmMat = () => cached('stoneWarm', () => new THREE.MeshStandardMaterial({ color: 0x8a8274, map: T.stoneCourses('#9b9282'), roughness: 0.82 }));
const groundMat = () => cached('ground', () => new THREE.MeshStandardMaterial({ color: 0x161a21, map: T.paving('#242830', 6), roughness: 0.94 }));
const streetMat = () => cached('street', () => new THREE.MeshStandardMaterial({ color: 0x3a3f47, map: T.paving('#33383f', 3), roughness: 0.42, metalness: 0.28 }));

/**
 * 两市河一港 — the water, both banks, the stone quay and the paved streets.
 * Everything that is "ground" is built here so the modules above it can just
 * stand on RIVER.streetY / RIVER.bankTopY.
 */
const LANE_W = 6.4;
const LANE_Z0 = STREET.northZ;
const LANE_Z1 = 36;

export function buildRivers(scene) {
  const { mat, uni } = waterMaterial();

  const main = new THREE.Mesh(
    new THREE.PlaneGeometry(RIVER.xMax - RIVER.xMin, RIVER.northEdge - RIVER.southEdge, 44, 12),
    mat,
  );
  main.geometry.rotateX(-Math.PI / 2);
  main.position.set((RIVER.xMin + RIVER.xMax) / 2, WATER_Y, 0);
  main.renderOrder = 3;
  main.name = 'luzhi-market-river';
  scene.add(main);

  const inlet = new THREE.Mesh(
    new THREE.PlaneGeometry(INLET.x1 - INLET.x0, INLET.zTo - INLET.zFrom, 10, 34),
    mat,
  );
  inlet.geometry.rotateX(-Math.PI / 2);
  inlet.position.set((INLET.x0 + INLET.x1) / 2, WATER_Y, (INLET.zFrom + INLET.zTo) / 2);
  inlet.renderOrder = 3;
  inlet.name = 'luzhi-inlet';
  scene.add(inlet);

  /* ---------------- 驳岸：市河两岸 + 港两岸 */
  const banks = new THREE.Group();
  banks.name = 'banks';
  const stone = [], wet = [], coping = [], rail = [];
  const mainLen = RIVER.xMax - RIVER.xMin;

  stone.push(quayWall(mainLen, RIVER.northEdge + 2, 4, RIVER.wallTop, 0));
  stone.push(quayWall(mainLen, RIVER.southEdge - 2, 4, RIVER.wallTop, 0));
  wet.push(box(mainLen, 1.5, 0.6, 0, -0.9, RIVER.northEdge + 0.15, 0));
  wet.push(box(mainLen, 1.5, 0.6, 0, -0.9, RIVER.southEdge - 0.15, 0));
  coping.push(box(mainLen, 0.22, 0.5, 0, RIVER.wallTop, RIVER.northEdge + 0.9));
  coping.push(box(mainLen, 0.22, 0.5, 0, RIVER.wallTop, RIVER.southEdge - 0.9));

  // 石堤（河坝）：堤顶到街之间那一条走道
  stone.push(box(mainLen, 0.5, STREET.quayZ - RIVER.northEdge + 2, 0, RIVER.bankTopY - 0.5, (RIVER.northEdge + STREET.quayZ) / 2));
  stone.push(box(mainLen, 0.5, STREET.quayZ - RIVER.northEdge + 2, 0, RIVER.bankTopY - 0.5, -(RIVER.northEdge + STREET.quayZ) / 2));

  const inletLen = INLET.zTo - INLET.zFrom;
  stone.push(box(4, RIVER.wallTop + 4, inletLen, INLET.x1 + 2, -4, (INLET.zFrom + INLET.zTo) / 2));
  stone.push(box(4, RIVER.wallTop + 4, inletLen, INLET.x0 - 2, -4, (INLET.zFrom + INLET.zTo) / 2));
  coping.push(box(0.5, 0.22, inletLen, INLET.x1 + 0.9, RIVER.wallTop, (INLET.zFrom + INLET.zTo) / 2));
  coping.push(box(0.5, 0.22, inletLen, INLET.x0 - 0.9, RIVER.wallTop, (INLET.zFrom + INLET.zTo) / 2));

  /* ---------------- 埠头：石阶下水 */
  for (const x of [-120, -60, 4, 70, 150, 216]) {
    stone.push(...steps(x, RIVER.northEdge - 1.2, 1, RIVER.bankTopY - 0.3, -0.5, 5));
    stone.push(...steps(x - 28, RIVER.southEdge + 1.2, -1, RIVER.bankTopY - 0.3, -0.5, 5));
  }
  for (const z of [34, 66, 108]) {
    stone.push(...steps(INLET.x1 - 1.2, z, 1, RIVER.bankTopY - 0.3, -0.5, 4, 2.6));
  }
  /* ---------------- 系缆桩 */
  for (const x of [-152, -142, -66, -54, 2, 14, 96, 128, 178, 196]) {
    stone.push(box(0.32, 0.85, 0.32, x, RIVER.bankTopY - 0.5, RIVER.northEdge - 1.5));
  }
  /* ---------------- 河栏：只在没有石阶的段上 */
  const gapsN = [[-124, -116], [-64, -56], [0, 8], [66, 74], [146, 154], [212, 220]];
  const gapsS = [[-152, -144], [-32, -24], [-24, -12], [40, 48], [118, 126], [170, 178]];
  for (let x = RIVER.xMin + 8; x < RIVER.xMax - 8; x += 2.2) {
    if (!gapsN.some(([a, b]) => x > a && x < b)) rail.push(box(0.18, 0.92, 0.18, x, RIVER.wallTop, RIVER.northEdge + 1.7));
    if (!gapsS.some(([a, b]) => x > a && x < b)) rail.push(box(0.18, 0.92, 0.18, x, RIVER.wallTop, RIVER.southEdge - 1.7));
  }
  rail.push(box(mainLen, 0.15, 0.32, 0, RIVER.wallTop + 0.92, RIVER.northEdge + 1.7));
  rail.push(box(mainLen, 0.15, 0.32, 0, RIVER.wallTop + 0.92, RIVER.southEdge - 1.7));

  banks.add(mesh(stone, stoneMat()));
  banks.add(mesh(wet, wetStoneMat()));
  banks.add(mesh(coping, stoneWarmMat()));
  banks.add(mesh(rail, stoneWarmMat()));
  scene.add(banks);

  /* ---------------- 地：街面、巷、寺前地坪、镇外地面 */
  const ground = new THREE.Group();
  ground.name = 'ground';

  // 街：河两岸各一条石板街
  const streetLen = STREET.xMaxWest - STREET.xMinEast;
  const streetCx = (STREET.xMaxWest + STREET.xMinEast) / 2;
  const sw = Math.abs(STREET.northZ - STREET.quayZ);
  ground.add(mesh([
    box(streetLen, 0.3, sw, streetCx, RIVER.streetY - 0.3, (STREET.northZ + STREET.quayZ) / 2, 0),
    box(streetLen, 0.3, sw, streetCx, RIVER.streetY - 0.3, -(STREET.northZ + STREET.quayZ) / 2, 0),
  ], streetMat(), 'streets'));
  // 街心的排水沟线
  ground.add(mesh([
    box(streetLen, 0.06, 0.42, streetCx, RIVER.streetY - 0.02, (STREET.northZ + STREET.quayZ) / 2, 0),
    box(streetLen, 0.06, 0.42, streetCx, RIVER.streetY - 0.02, -(STREET.northZ + STREET.quayZ) / 2, 0),
  ], cached('gutter', () => new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 }))));

  // 巷：进寺的那条
  ground.add(mesh(box(LANE_W, 0.3, LANE_Z1 - LANE_Z0, 30, RIVER.streetY - 0.3, (LANE_Z0 + LANE_Z1) / 2, 0), streetMat(), 'lane'));

  // 大块地：河北岸屋后、河南岸屋后、港西、港东、远处
  const dirt = [];
  dirt.push(box(760, 3.4, 90, 0, -0.4, STREET.northZ + 45));
  dirt.push(box(760, 3.4, 90, 0, -0.4, -(STREET.northZ + 45)));
  dirt.push(box(120, 3.2, 200, INLET.x1 + 62, -0.4, 90));
  dirt.push(box(80, 3.2, 200, INLET.x0 - 42, -0.4, 90));
  dirt.push(box(500, 3.0, 260, -10, -0.4, 230));
  dirt.push(box(500, 3.0, 260, -10, -0.4, -230));
  ground.add(mesh(dirt, groundMat(), 'earth'));

  scene.add(ground);

  return {
    water: [main, inlet], uni, banks, ground,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

const LANE_W = 6.4;
const LANE_Z0 = STREET.northZ;
const LANE_Z1 = 36;
