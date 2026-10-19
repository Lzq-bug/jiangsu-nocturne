/**
 * 夜天的部分：天穹、星、月、雾与几个把砖墙压出暖色的光源。
 * 城在河对岸（-Z 北），所以地平线上那条钠灯带压在北边；
 * 月悬东南——月出方位与高度都是画面处理，不对应真实星历。
 */
import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';
import { MOON, FOG } from './data.js';

export const MOON_DIR = new THREE.Vector3(...MOON).normalize();

function skyDome() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0040,0.0062,0.0155);
        vec3 mid    = vec3(0.0095,0.0140,0.0310);
        vec3 horizon= vec3(0.028,0.029,0.038);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.84,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.06, 0.10, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.2,0.0,1.0), 2.4) * sky;
        // 对岸的老城在北：一条压得很低的暖光害
        float city = smoothstep(0.28, -0.96, d.z);
        float band = exp(-pow((d.y-0.010)/0.048, 2.0));
        col += vec3(0.080,0.044,0.018) * haze * (0.36 + 1.10*city);
        col += vec3(0.016,0.036,0.054) * haze * band * 0.85;
        // 东南的月
        float md = max(0.0, dot(d, normalize(vec3(0.44,0.47,0.74))));
        col += vec3(0.050,0.060,0.090) * pow(md, 30.0) * 1.05 * sky;
        col += vec3(0.020,0.024,0.038) * pow(md, 6.0) * 0.5 * sky;
        float c = n(d.xz*4.0 + vec2(uTime*0.0030, uTime*0.0011)) * 0.64 + n(d.xz*10.5 - vec2(uTime*0.0052,0.0))*0.36;
        float cl = smoothstep(0.46,0.88,c) * smoothstep(0.01,0.24,d.y);
        col = mix(col, col + vec3(0.018,0.024,0.040), cl);
        col = mix(col, vec3(0.0032,0.0044,0.0086), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

function stars() {
  const N = 780, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.12 + Math.pow(rand(), 0.7) * 0.88;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 2150, y * 2150, Math.sin(a) * r * 2150], i * 3);
    size[i] = 0.55 + Math.pow(rand(), 4) * 2.2;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBright: { value: 1 },
      uTex: { value: T.softGlow('210,225,255', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.3+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.86,0.9,1.0), t.a*vA*0.5); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(17, 26, 18), glow('#fff4d6', 2.0));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,238,200', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(240, 240, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(2050);
  return grp;
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());

  const hemi = new THREE.HemisphereLight(0x35507e, 0x0e131c, 1.05);
  const moonLight = new THREE.DirectionalLight(0xb6d2ff, 0.9);
  moonLight.position.copy(MOON_DIR).multiplyScalar(700);
  // 对岸的光害从北边压过来，给背面一层极淡的暖
  const cityBack = new THREE.DirectionalLight(0xffa066, 0.45);
  cityBack.position.set(-60, 40, -520);
  cityBack.target.position.set(0, 20, 60);
  scene.add(hemi, moonLight, cityBack, cityBack.target);

  // 沿河步道与门口的几盏暖光，近处砖墙全靠它们才有颜色
  const shore = [];
  for (const x of [-168, -124, -80, -36, 8, 52, 96, 150]) {
    const l = new THREE.PointLight(0xffbe82, 950, 70, 2);
    l.position.set(x, 5.6, 8);
    scene.add(l);
    shore.push(l);
  }
  // 园内主路上四盏，照到池面就停；别压在假山上，湖石最吃不住近光
  const court = [];
  for (const [x, z, p] of [[-14, 19, 300], [24, 19, 300], [58, 30, 240], [-66, 20, 190]]) {
    const l = new THREE.PointLight(0xffcf9a, p, 46, 2);
    l.position.set(x, 4.2, z);
    scene.add(l);
    court.push(l);
  }

  scene.fog = new THREE.FogExp2(new THREE.Color(FOG.color).getHex(), FOG.density);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, cityBack, shore, court },
    setStarBright(v) { star.uni.uBright.value = v; },
    setLamp(v) {
      for (const l of shore) l.intensity = l.userData.base * v;
      for (const l of court) l.intensity = l.userData.base * v;
    },
    init() {
      for (const l of [...shore, ...court]) l.userData.base = l.intensity;
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
