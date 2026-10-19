import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARDEN, GROUND } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0a1418);
export const FOG_DENSITY = 0.0038;

/* ------------------------------------------------------------------ reflections */

/** shared wobble injected into any mirrored material */
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
    // what reads in the water is the light: prefer the emissive map
    const showMap = src.emissiveMap || src.map || null;
    if (src.emissiveMap) c.setRGB(1, 1, 1).multiplyScalar(0.7);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: showMap, alphaMap: src.alphaMap || null, alphaTest: src.alphaTest || 0,
      transparent: true,
      opacity: src.emissiveMap ? 0.9 : 0.62,
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
          transformed.x += (sin(transformed.y*0.34 + wt*1.5) + sin(transformed.z*0.42 - wt*0.9)) * uAmp * uRipple;
          transformed.z += (sin(transformed.y*0.28 - wt*1.1) + sin(transformed.x*0.38 + wt*1.7)) * uAmp * 0.8 * uRipple;
        `);
      // a mirror this shallow has to dissolve before it reaches the river bed
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-uFade, -1.5, vWorldPosition.y) * 0.92 + 0.08;
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
    m.customProgramCacheKey = () => `canglang-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * Mirrored copy of a source group under the water plane. Shader surfaces whose
 * names begin with "media" or "beam" are skipped: they would collapse to a flat
 * colour once rebuilt as basic materials.
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
      // point clouds and the additive spill sheets are glow, not form: mirrored
      // they turn into white smears on the water, so they stay out
      if (o.isPoints || /^(media|beam|lantern-halos|lattice-spill|fireflies)/.test(o.name || '')) {
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
    const skip = /^(media|beam|lantern-halos|lattice-spill|fireflies)/;
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

/** additive light columns dragged down the water under every lamp */
export class LightColumns {
  constructor(scene, capacity = 260) {
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
          float wob = sin(wp.z*0.24 + uTime*1.6) * 0.7 + sin(wp.x*0.31 - uTime*1.15) * 0.5;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.5;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.74 + 0.26*sin(uTime*2.1 + wp.x*0.4 + wp.z*0.55);
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
      d.position.set(it.pos.x, WATER_Y - 0.06, it.pos.z);
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

/* ------------------------------------------------------------------ the water */

function waterMaterial() {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#04090d') },
    uShallow: { value: new THREE.Color('#182a32') },
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
        float h = sin(p.x*0.14 + uTime*0.5)*0.24 + sin(p.y*0.11 - uTime*0.42)*0.3
                + sin((p.x+p.y)*0.31 + uTime*1.0)*0.1;
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
        vec3 col = mix(vec3(0.0042,0.0068,0.015), vec3(0.009,0.014,0.028), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.3,0.0,1.0), 2.2);
        float north = smoothstep(0.25, -0.95, d.z);
        col += vec3(0.055,0.031,0.014) * haze * (0.5 + 1.1*north);
        col += vec3(0.008,0.018,0.026) * pow(max(0.0, dot(d, uMoon)), 40.0);
        return mix(col, vec3(0.0022,0.0032,0.0060), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // fine chop aliases from a station on the bridge, so it fades with distance
        float det = clamp(1.0 - length(cameraPosition - vW) / 120.0, 0.0, 1.0);
        float dx = cos(p.x*0.14 + t*0.5)*0.14*0.24 + cos((p.x+p.y)*0.31 + t*1.0)*0.31*0.1;
        float dz = cos(p.y*0.11 - t*0.42)*0.11*0.3 + cos((p.x+p.y)*0.31 + t*1.0)*0.31*0.1;
        float c1 = sin(p.x*0.86 + t*1.7) * sin(p.y*0.74 - t*1.3);
        float c2 = sin(p.x*1.42 - t*2.1 + p.y*0.96) * 0.6;
        dx += (c1*0.86 + c2*1.42) * 0.055 * uRipple * det;
        dz += (cos(p.x*0.68 - t*1.4)*0.68*0.9 + c2*0.96) * 0.055 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.14 + 0.34*fres);
        // at a grazing angle a night river is essentially a mirror of the sky and
        // of whatever the city is putting up at the horizon
        col = mix(col, skyAt(normalize(r)) * 2.1, 0.14 + 0.52*fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.60, 0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.34,0.40,0.52) * pow(ndh, 240.0) * (0.35 + lane*1.5);
        col += vec3(0.12,0.16,0.24) * pow(ndh, 42.0) * (0.10 + lane*0.5);

        float sparkle = pow(max(0.0, sin(p.x*3.1 + t*2.2) * sin(p.y*2.6 - t*1.9)), 15.0);
        col += vec3(0.18,0.20,0.24) * sparkle * 0.10 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.02 + vec2(t*0.010, -t*0.014)).r;
        col *= 0.93 + nsh*0.14;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        // a shallow urban river: looking down you see into dark water, at grazing
        // angles the surface lets the mirror through
        float a = clamp(0.34 + 0.26 * (1.0 - fres) + f * 0.42, 0.0, 0.94);
        gl_FragColor = vec4(col, a);
      }`,
  });
  return { mat, uni };
}

/**
 * Three sheets, one material: the river north of the wall, its south-turning
 * east arm, and the small pool inside the garden.
 */
export function buildWaters(scene) {
  const { mat, uni } = waterMaterial();
  const meshes = [];
  const plane = (x0, x1, z0, z1, segX, segZ, name) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2, WATER_Y, (z0 + z1) / 2);
    m.renderOrder = 3;
    m.name = name;
    scene.add(m);
    meshes.push(m);
    return m;
  };
  const R = GARDEN.river, E = GARDEN.eastArm, P = GARDEN.pool;
  plane(R.xFrom, R.xTo, R.zC - R.halfW, R.zC + R.halfW, 60, 10, 'river-north');
  plane(E.xC - E.halfW, E.xC + E.halfW, E.zFrom, E.zTo, 12, 48, 'river-east');
  // the pool is still water: fewer segments, it only has to hold a reflection
  plane(P.xC - P.hx, P.xC + P.hx, P.zC - P.hz, P.zC + P.hz, 20, 18, 'inner-pool');

  return {
    meshes, uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/** the dark bed under a shallow river, so the water has a bottom to look into */
export function buildBed(scene, material) {
  const R = GARDEN.river, E = GARDEN.eastArm, P = GARDEN.pool;
  const slab = (x0, x1, z0, z1, y) => {
    const b = new THREE.BoxGeometry(x1 - x0, 0.6, z1 - z0);
    b.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    return b;
  };
  const parts = [
    slab(R.xFrom, R.xTo + 6, R.zC - R.halfW - 1, R.zC + R.halfW + 1, -2.6),
    slab(E.xC - E.halfW - 1, E.xC + E.halfW + 1, E.zFrom, E.zTo, -2.6),
    slab(P.xC - P.hx - 0.6, P.xC + P.hx + 0.6, P.zC - P.hz - 0.6, P.zC + P.hz + 0.6, -2.2),
  ];
  const m = new THREE.Mesh(mergeGeometries(parts), material);
  m.name = 'river-bed';
  scene.add(m);
  return m;
}
