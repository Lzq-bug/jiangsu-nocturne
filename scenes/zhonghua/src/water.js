import * as THREE from 'three';
import { MOAT } from './data.js';
import { MOON_DIR } from './environment.js';
import * as T from './textures.js';

export const WATER_Y = 0;

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
          transformed.x += (sin(transformed.y*0.32 + wt*1.7) + sin(transformed.z*0.51 - wt*1.1)) * 0.19 * uRipple;
          transformed.z += (sin(transformed.y*0.27 - wt*1.3) + sin(transformed.x*0.44 + wt*1.9)) * 0.15 * uRipple;
        `);
      // fade the mirror out as it sinks below the surface
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-26.0, -1.0, vWorldPosition.y) * 0.92 + 0.08;
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
    m.customProgramCacheKey = () => 'qinhuai-wobble';
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
      if (o.isMesh) {
        // 城垣的挤出体带 groups（立面 / 洞内壁），倒影里每位都得换成对应的材质，
        // 否则 geometry 的 materialIndex 会指到数组外面
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
          float a = m * fade * vFlick * uStrength;
          gl_FragColor = vec4(vCol * uDepth, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 1500);
    // the shader reads instanceColor, so it must exist before the program is compiled
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500 * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();
  }
  /** returns an index you can later move with setPos() */
  add(pos, color, width = 1.1, depth = 9, intensity = 1) {
    if (this.items.length >= this.mesh.instanceMatrix.count) return -1;
    const i = this.items.length;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity),
      width, depth, baseWidth: width, baseDepth: depth, on: true,
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

export function buildWater(scene, columns, river = MOAT, moonDir = MOON_DIR) {
  // river.along === 'x' lays the sheet out east-west; the shader's across-axis
  // follows, otherwise the quay darkening would run down the middle of the water
  const east = river.along === 'x';
  const cx = river.centerX || 0, cz = river.centerZ || 0;
  const geo = new THREE.PlaneGeometry(
    river.halfWidth * 2 + 3, river.length,
    Math.max(28, Math.round(river.halfWidth / 2)),
    Math.max(90, Math.round(river.length / 6)),
  );
  geo.rotateX(-Math.PI / 2);
  if (east) geo.rotateY(Math.PI / 2);
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uAlong: { value: east ? 1 : 0 },
    uCenter: { value: new THREE.Vector2(cx, cz) },
    uMoon: { value: moonDir.clone() },
    uDeep: { value: new THREE.Color('#01040a') },
    uShallow: { value: new THREE.Color('#050f1c') },
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
        float h = sin(p.x*0.16 + uTime*0.9)*0.11 + sin(p.y*0.09 - uTime*0.65)*0.13
                + sin((p.x+p.y)*0.31 + uTime*1.5)*0.05;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon; uniform float uAlong;
      uniform vec2 uCenter;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.009,0.020), vec3(0.013,0.018,0.040), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        float warm = smoothstep(-0.3,0.9, d.x*0.7 - d.z*0.25);
        col += vec3(0.026,0.011,0.004) * haze * (0.35 + 0.9*warm);
        col += vec3(0.022,0.026,0.040) * pow(max(0.0,dot(d,uMoon)), 30.0);
        return mix(col, vec3(0.003,0.004,0.008), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // high-frequency chop aliases into moiré when seen from far up-river, so it
        // hands over to the long swells with distance
        float det = clamp(1.0 - length(cameraPosition - vW) / 130.0, 0.0, 1.0);
        // analytic normal from the same wave sum used in the vertex stage
        float dx = cos(p.x*0.16 + t*0.9)*0.16*0.11 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        float dz = cos(p.y*0.09 - t*0.65)*0.09*0.13 + cos((p.x+p.y)*0.31 + t*1.5)*0.31*0.05;
        // fine chop
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
        // moon glitter stays in a narrow lane instead of sheeting over the river
        float lane = smoothstep(0.55, 0.98, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.42,0.48,0.62) * pow(ndh, 420.0) * (0.55 + lane*1.5);
        col += vec3(0.16,0.20,0.30) * pow(ndh, 60.0) * (0.12 + lane*0.5);

        float sparkle = pow(max(0.0, sin(p.x*7.3 + t*3.1) * sin(p.y*6.1 - t*2.4)), 12.0);
        col += vec3(0.22,0.24,0.28) * sparkle * 0.035 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.014 + vec2(t*0.02, -t*0.03)).r;
        col *= 0.95 + nsh*0.1;

        // oily darkening against the quay walls
        float across = mix(abs(p.x - uCenter.x), abs(p.y - uCenter.y), uAlong);
        float edge = smoothstep(${(river.halfWidth + 1).toFixed(1)}, ${(river.halfWidth - 3.5).toFixed(1)}, across);
        col *= 1.0 - edge*0.3;

        float a = clamp(0.80 + fres*0.16, 0.0, 0.96);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, WATER_Y, cz);
  mesh.renderOrder = 3;
  mesh.name = 'moat-water';
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
