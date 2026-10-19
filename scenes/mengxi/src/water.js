import * as THREE from 'three';
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

/**
 * 梦溪 / 池 的水面。几何由调用方给（溪是一条蜿蜒的带，池是它松开的一段），
 * 顶点上的 aBank 记着离驳岸有多近，油亮的收边才跟着真实轮廓走。
 */
export function buildWater(scene, geometry, moonDir) {
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: moonDir.clone() },
    uDeep: { value: new THREE.Color('#04080e') },
    uShallow: { value: new THREE.Color('#0a141d') },
    uNoise: { value: T.noise() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      attribute float aBank;
      varying vec3 vW; varying float vBank;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        // 近岸的浪被石壁压住，只在开阔处起长波
        float open = 1.0 - aBank;
        float h = sin(p.x*0.42 + uTime*1.15)*0.055 + sin(p.y*0.31 - uTime*0.85)*0.065
                + sin((p.x+p.y)*0.83 + uTime*1.9)*0.028;
        wp.y += h * uRipple * (0.35 + 0.85*open);
        vW = wp.xyz; vBank = aBank;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      varying vec3 vW; varying float vBank;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.016,0.023,0.048), vec3(0.034,0.046,0.090), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.6,0.0,1.0), 2.2);
        float warm = smoothstep(-0.3,0.9, d.x*0.7 - d.z*0.25);
        col += vec3(0.055,0.023,0.009) * haze * (0.35 + 0.9*warm);
        col += vec3(0.055,0.065,0.100) * pow(max(0.0,dot(d,uMoon)), 26.0);
        return mix(col, vec3(0.004,0.005,0.010), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // 高频细节在远看时会摩尔纹成一片，随距离交还给长波
        float det = clamp(1.0 - length(cameraPosition - vW) / 70.0, 0.0, 1.0);
        float dx = cos(p.x*0.42 + t*1.15)*0.42*0.055 + cos((p.x+p.y)*0.83 + t*1.9)*0.83*0.028;
        float dz = cos(p.y*0.31 - t*0.85)*0.31*0.065 + cos((p.x+p.y)*0.83 + t*1.9)*0.83*0.028;
        float c1 = sin(p.x*2.3 + t*2.4) * sin(p.y*1.9 - t*2.0);
        float c2 = sin(p.x*4.1 - t*3.1 + p.y*3.0) * 0.6;
        dx += (c1*2.3 + c2*4.1) * 0.011 * uRipple * det;
        dz += (cos(p.x*1.8 - t*1.7)*1.8*0.9 + c2*3.0) * 0.011 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.12 + 0.22*fres);
        // 夜里水好不好看，全看它接住了多少天光
        col = mix(col, skyAt(normalize(r)) * 1.35, 0.20 + 0.62*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        // 月粳只留一条窄窄的光带，别铺满整片水
        float lane = smoothstep(0.5, 0.97, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.42,0.48,0.62) * pow(ndh, 380.0) * (0.5 + lane*1.7);
        col += vec3(0.16,0.20,0.30) * pow(ndh, 55.0) * (0.1 + lane*0.5);

        float sparkle = pow(max(0.0, sin(p.x*9.1 + t*3.0) * sin(p.y*8.3 - t*2.5)), 14.0);
        col += vec3(0.24,0.26,0.30) * sparkle * 0.05 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.03 + vec2(t*0.02, -t*0.03)).r;
        col *= 0.95 + nsh*0.1;

        // 贴近驳岸的一圈压暗，水才像是盛在石槽里
        col *= 1.0 - vBank*0.34;

        float a = clamp(0.84 + fres*0.14, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 3;
  mesh.name = 'mengxi-water';
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
