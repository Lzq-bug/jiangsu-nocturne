import * as THREE from 'three';
import { LAKE } from './data.js';
import { MOON_DIR } from './sky.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0a1220);
export const FOG_DENSITY = 0.00042;

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
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.62);
    // what actually reads in the water is the light: prefer the emissive map
    const showMap = src.emissiveMap || src.map || null;
    if (src.emissiveMap) c.setRGB(1, 1, 1).multiplyScalar(0.7);
    // the emissive sheets are alpha-cut, so the mirror can blend over the water
    // instead of adding up: stacked additive copies blew out at grazing angles
    const m = new THREE.MeshBasicMaterial({
      color: c, map: showMap, transparent: true,
      opacity: src.emissiveMap ? 0.82 : 0.5,
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
          transformed.x += (sin(transformed.y*0.085 + wt*1.5) + sin(transformed.z*0.11 - wt*0.9)) * 1.9 * uRipple;
          transformed.z += (sin(transformed.y*0.07 - wt*1.1) + sin(transformed.x*0.09 + wt*1.7)) * 1.5 * uRipple;
        `);
      // a 300 m mirror has to dissolve long before it reaches the lake bed
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-230.0, -2.0, vWorldPosition.y) * 0.94 + 0.06;
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
    m.customProgramCacheKey = () => `jinji-wobble-${key}`;
    this.cache.set(key, m);
    return m;
  }
}

/**
 * Mirrored copy of a source group under the water plane. Anything named
 * media-* or beam-* is skipped: those are shader surfaces that would collapse
 * into a flat colour once rebuilt as a basic material.
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
  constructor(scene, capacity = 900) {
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
          float wob = sin(wp.z*0.055 + uTime*1.6) * 0.7 + sin(wp.x*0.07 - uTime*1.15) * 0.5;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 1.1*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 2.2;
          vUv = uv;
          vCol = instanceColor;
          vFlick = 0.74 + 0.26*sin(uTime*2.3 + wp.x*0.4 + wp.z*0.55);
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
  /** returns an index you can later move, recolour or switch off */
  add(pos, color, width = 2.4, depth = 40, intensity = 1) {
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
      d.position.set(it.pos.x, WATER_Y - 0.4, it.pos.z);
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

/* ------------------------------------------------------------------ the lake */

export function buildLake(scene) {
  const near = LAKE.nearZ, far = LAKE.farZ;
  const w = LAKE.halfWidth * 2, d = far - near;
  const geo = new THREE.PlaneGeometry(w, d, 48, 48);
  geo.rotateX(-Math.PI / 2);

  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#01050c') },
    uShallow: { value: new THREE.Color('#04101c') },
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
        float h = sin(p.x*0.018 + uTime*0.55)*0.55 + sin(p.y*0.013 - uTime*0.4)*0.7
                + sin((p.x+p.y)*0.041 + uTime*1.05)*0.22;
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
        vec3 col = mix(vec3(0.005,0.008,0.018), vec3(0.011,0.016,0.036), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.3,0.0,1.0), 2.2);
        float west = smoothstep(0.35, -0.95, d.z);
        col += vec3(0.030,0.017,0.008) * haze * (0.4 + 1.0*west);
        col += vec3(0.010,0.022,0.032) * pow(max(0.0, dot(d, uMoon)), 40.0);
        return mix(col, vec3(0.0026,0.0036,0.0072), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // fine chop aliases into moiré from the far bank, so it fades with distance
        float det = clamp(1.0 - length(cameraPosition - vW) / 380.0, 0.0, 1.0);
        float dx = cos(p.x*0.018 + t*0.55)*0.018*0.55 + cos((p.x+p.y)*0.041 + t*1.05)*0.041*0.22;
        float dz = cos(p.y*0.013 - t*0.4)*0.013*0.7 + cos((p.x+p.y)*0.041 + t*1.05)*0.041*0.22;
        float c1 = sin(p.x*0.42 + t*1.9) * sin(p.y*0.37 - t*1.5);
        float c2 = sin(p.x*0.78 - t*2.4 + p.y*0.55) * 0.6;
        dx += (c1*0.42 + c2*0.78) * 0.055 * uRipple * det;
        dz += (cos(p.x*0.33 - t*1.4)*0.33*0.9 + c2*0.55) * 0.055 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.10 + 0.26*fres);
        // the near mirror already carries the building; the water only tints it
        col = mix(col, skyAt(normalize(r)) * 0.5, 0.06 + 0.30*fres);

        vec3 Hv = normalize(V + uMoon);
        float ndh = max(dot(n, Hv), 0.0);
        float lane = smoothstep(0.62, 0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 320.0) * (0.4 + lane*1.6);
        col += vec3(0.14,0.18,0.28) * pow(ndh, 48.0) * (0.10 + lane*0.55);

        float sparkle = pow(max(0.0, sin(p.x*2.1 + t*2.4) * sin(p.y*1.7 - t*1.8)), 14.0);
        col += vec3(0.20,0.22,0.26) * sparkle * 0.10 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.0035 + vec2(t*0.010, -t*0.014)).r;
        col *= 0.93 + nsh*0.14;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        // looking down you see into dark water; at grazing angles the surface lets
        // the mirror through, which is where a lake reflection actually lives
        float a = clamp(0.42 + 0.30 * (1.0 - fres) + f * 0.40, 0.0, 0.96);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_Y, (near + far) / 2);
  mesh.renderOrder = 3;
  mesh.name = 'jinji-lake';
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
