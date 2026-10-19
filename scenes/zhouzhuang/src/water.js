import * as THREE from 'three';
import { waterRects } from './data.js';
import { MOON_DIR } from './sky.js';
import { box, mesh, rectUniforms, maskGlsl } from './kit.js';
import * as T from './textures.js';

export const WATER_Y = 0;
export const FOG_COLOR = new THREE.Color(0x0b1016);
export const FOG_DENSITY = 0.0015;

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
      // a 40 m tower mirror has to dissolve before it reaches the river bed
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-42.0, -1.2, vWorldPosition.y) * 0.9 + 0.1;
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
    // one program per source material: these clones differ in defines (map or not),
    // so they must not share a cache key
    m.customProgramCacheKey = () => `zz-wobble-${key}`;
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
      width, depth, on: true,
      color: new THREE.Color(color).multiplyScalar(intensity),
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
      d.position.set(it.pos.x, WATER_Y + 0.16, it.pos.z);
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

/* ------------------------------------------------------------------ the water skin */

/**
 * One translucent skin over the whole basin, cut to the 井字 rects in the shader.
 * Where the skin is thin (grazing angles) the mirrored town shows through, which
 * is where a canal reflection actually lives; where you look down it goes black.
 */
export function buildWater(scene) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDeep: { value: new THREE.Color('#01060a') },
    uShallow: { value: new THREE.Color('#0b1c26') },
    uNoise: { value: T.noise() },
    uFog: { value: FOG_COLOR.clone() },
    uFogDensity: { value: FOG_DENSITY },
    ...rectUniforms(waterRects()),
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `${maskGlsl}
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.055 + uTime*0.6)*0.30 + sin(p.y*0.075 - uTime*0.45)*0.26
                + sin((p.x+p.y)*0.14 + uTime*1.1)*0.10;
        wp.y += h * uRipple;
        vW = wp.xyz;
        // cut the skin down to a few metres outside the rects: over land it is
        // discarded, and a full-plane fragment cost here would eat the frame time
        gl_Position = projectionMatrix * viewMatrix * wp;
        float sd = waterSd(wp.xz);
        if (sd > 30.0) gl_Position = vec4(2.0,2.0,2.0,1.0);
      }`,
    fragmentShader: `${maskGlsl}
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      uniform vec3 uFog; uniform float uFogDensity;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0042,0.0058,0.0135), vec3(0.010,0.013,0.028), smoothstep(0.5,0.84,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.3,0.0,1.0), 2.2);
        // the town glows toward the north (-z) and along both sides
        float town = smoothstep(0.30, -0.90, d.z)*0.8 + smoothstep(0.5, -0.9, d.x)*0.55;
        col += vec3(0.020,0.012,0.007) * haze * (0.3 + town * 0.8);
        col += vec3(0.012,0.020,0.030) * pow(max(0.0, dot(d, uMoon)), 44.0);
        return mix(col, vec3(0.0024,0.0030,0.0060), smoothstep(0.0, -0.05, d.y));
      }
      void main(){
        float sd = waterSd(vW.xz);
        float edge = smoothstep(0.55, -0.25, sd);
        if (edge < 0.02) discard;
        vec2 p = vW.xz;
        float t = uTime;
        // fine chop aliases into moiré from the far bank, so it fades with distance
        float det = clamp(1.0 - length(cameraPosition - vW) / 170.0, 0.0, 1.0);
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
        col += vec3(0.44,0.46,0.56) * pow(ndh, 260.0) * (0.35 + lane*1.9) * det;
        col += vec3(0.16,0.17,0.22) * pow(ndh, 42.0) * (0.10 + lane*0.6);

        float sparkle = pow(max(0.0, sin(p.x*4.2 + t*2.6) * sin(p.y*3.4 - t*2.0)), 13.0);
        col += vec3(0.24,0.24,0.26) * sparkle * 0.12 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.012 + vec2(t*0.014, -t*0.018)).r;
        col *= 0.92 + nsh*0.16;

        float dist = length(cameraPosition - vW);
        float f = 1.0 - exp(-pow(dist*uFogDensity, 2.0));
        col = mix(col, uFog, f);

        float a = clamp(0.52 + 0.26 * (1.0 - fres) + f * 0.40, 0.0, 0.97) * edge;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const geo = new THREE.PlaneGeometry(1500, 1180, 150, 118);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, mat);
  water.position.set(60, WATER_Y, 120);
  water.renderOrder = 3;
  water.name = 'zz-water';
  scene.add(water);
  return { water, uni };
}

/** dark still water under the bridges reads shallower: a thin green band */
export function buildWeir(scene, list) {
  const parts = list.map(([x0, z0, x1, z1]) => box(x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, 0.04, (z0 + z1) / 2, 0));
  const m = mesh(parts, new THREE.MeshStandardMaterial({ color: 0x0d2a2c, roughness: 0.22, metalness: 0.5 }));
  m.name = 'weir';
  scene.add(m);
  return m;
}
