import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';

/**
 * 月出在西北的江面上：西崖那一站抬头就是它，而从江上回望时
 * 月光斜打在山的西崖上，山的灯才读得出来。
 */
export const MOON_DIR = new THREE.Vector3(-0.58, 0.36, -0.24).normalize();

/** 江海夜天：顶上是薄的靛，北边压着城的光，西边是对岸的水气 */
function skyDome() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 zenith  = vec3(0.0034, 0.0054, 0.0125);
        vec3 mid     = vec3(0.0078, 0.0116, 0.0240);
        vec3 horizon = vec3(0.0100, 0.0140, 0.0190);
        vec3 col = mix(zenith, mid, smoothstep(0.5, 0.86, up));
        col = mix(col, horizon, smoothstep(0.5, 0.28, up));
        float sky = smoothstep(-0.05, 0.12, d.y);
        float haze = pow(clamp(1.0 - abs(d.y) * 2.2, 0.0, 1.0), 2.3) * sky;
        // 城在狼山的北与东北：一条钠黄的底光
        float north = smoothstep(0.2, -0.95, d.z) * smoothstep(-0.2, 0.5, d.x);
        // 江与对岸在西：冷一些，也更低
        float west  = smoothstep(0.15, -0.95, d.x);
        col += vec3(0.062, 0.033, 0.014) * haze * (0.32 + 1.0 * north);
        col += vec3(0.020, 0.034, 0.048) * haze * west * 0.85;
        col += vec3(0.010, 0.024, 0.032) * haze * exp(-pow((d.y - 0.012) / 0.055, 2.0));
        // 月晕
        float md = max(0.0, dot(d, normalize(vec3(-0.58, 0.36, -0.24))));
        col += vec3(0.052, 0.062, 0.088) * pow(md, 46.0) * 1.2 * sky;
        col += vec3(0.016, 0.021, 0.032) * pow(md, 7.0) * 0.7 * sky;
        // 江上过来的薄云，压得很平
        float c = n(d.xz * 2.6 + vec2(uTime * 0.0021, uTime * 0.0008)) * 0.62
                + n(d.xz * 7.2 - vec2(uTime * 0.0035, 0.0)) * 0.38;
        float cl = smoothstep(0.44, 0.9, c) * smoothstep(0.02, 0.34, d.y);
        col = mix(col, col + vec3(0.020, 0.024, 0.038), cl);
        col = mix(col, vec3(0.0028, 0.0046, 0.0072), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2600, 44, 26), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

function stars() {
  const N = 620;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.2 + Math.pow(rand(), 0.8) * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 2450, y * 2450, Math.sin(a) * r * 2450], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 4) * 2.2;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uBright: { value: 1 },
      uTex: { value: T.softGlow('210,225,245', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45 + 0.55 * sin(uTime * 1.2 + aPhase)) * uBright;
        gl_PointSize = aSize * (1.0 + vA * 0.6);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.84, 0.88, 0.98), t.a * vA * 0.45); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(24, 24, 16), glow('#fff4d8', 2.1));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,208', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(400, 400, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(2300);
  return grp;
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());

  const hemi = new THREE.HemisphereLight(0x39597a, 0x101518, 0.8);
  const moonLight = new THREE.DirectionalLight(0xc4d9f6, 1.5);
  moonLight.position.copy(MOON_DIR).multiplyScalar(900);
  // 城北的暖反光
  const cityBack = new THREE.DirectionalLight(0xffa066, 0.26);
  cityBack.position.set(120, 120, -900);
  cityBack.target.position.set(0, 40, 0);
  // 江东面来的冷补光，别让阴面死黑
  const fill = new THREE.DirectionalLight(0x7fa6b8, 0.3);
  fill.position.set(760, 260, 420);
  fill.target.position.set(0, 60, 0);
  // 江面把月光的低角度再抬一次
  const bounce = new THREE.DirectionalLight(0x9fc0e4, 0.22);
  bounce.position.set(-700, -60, -120);
  bounce.target.position.set(-40, 60, 0);
  scene.add(hemi, moonLight, cityBack, cityBack.target, fill, fill.target, bounce, bounce.target);

  scene.fog = new THREE.FogExp2(0x0b151b, 0.0011);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, cityBack, fill, bounce },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
