import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';

/**
 * 月落在湖那一侧偏北、抬得较高：这样西坡能吃到一层斜光，
 * 从放鹤亭望出去"西山之缺"里也挂着它；从湖西望山时山与亭仍是逆光的黑。
 */
export const MOON_DIR = new THREE.Vector3(-0.62, 0.52, -0.42).normalize();

/**
 * Night sky over an old city: thin indigo overhead, a warm sodium haze lying
 * along every horizon, the moon halo, and low cloud passing over it.
 */
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
        vec3 zenith  = vec3(0.0038,0.0060,0.0140);
        vec3 mid     = vec3(0.0090,0.0130,0.0265);
        vec3 horizon = vec3(0.0230,0.0230,0.0300);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.84,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.06, 0.10, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.5) * sky;
        // 城在环内与山东北，灯气从那一侧压上来；湖那一面干净得多
        float east = smoothstep(0.10, 0.95, d.x);
        float north = smoothstep(0.25, -0.95, d.z);
        col += vec3(0.062,0.034,0.015) * haze * (0.32 + 0.75*east + 0.55*north);
        col += vec3(0.012,0.028,0.040) * haze * exp(-pow((d.y-0.014)/0.05,2.0));
        // moon halo
        vec3 MD = normalize(vec3(-0.62,0.52,-0.42));
        float md = max(0.0, dot(d, MD));
        col += vec3(0.050,0.060,0.086) * pow(md, 30.0) * 1.2 * sky;
        col += vec3(0.018,0.022,0.034) * pow(md, 6.0) * 0.7 * sky;
        // thin cloud, flattened and drifting：低纬度的云在天顶拉成大片，压暗一点
        float c = n(d.xz*3.4 + vec2(uTime*0.0026, uTime*0.0011)) * 0.62 + n(d.xz*9.5 - vec2(uTime*0.0045,0.0))*0.38;
        float cl = smoothstep(0.52,0.92,c) * smoothstep(0.02,0.34,d.y);
        col = mix(col, col + vec3(0.011,0.013,0.022), cl);
        col = mix(col, vec3(0.0026,0.0036,0.0068), smoothstep(0.0, -0.07, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2700, 44, 26), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

/** 城市抬高了天光，只剩较亮的星；山里的天比园林里高 */
function stars() {
  const N = 760, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.2 + Math.pow(rand(), 0.8) * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 2480, y * 2480, Math.sin(a) * r * 2480], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 4) * 2.4;
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
      uTex: { value: T.softGlow('210,225,245', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.3+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.84,0.88,0.98), t.a*vA*0.5); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 16), glow('#fff4d8', 2.0));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,208', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(240, 240, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(2500);
  return grp;
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());

  const hemi = new THREE.HemisphereLight(0x3d5f7c, 0x141a18, 1.35);
  const moonLight = new THREE.DirectionalLight(0xc8dcf7, 2.9);
  moonLight.position.copy(MOON_DIR).multiplyScalar(900);
  // 城在环内与山东，抬过来一层暖的反光
  const cityBack = new THREE.DirectionalLight(0xffa066, 0.4);
  cityBack.position.set(520, 260, 40);
  cityBack.target.position.set(-60, 40, 0);
  // 湖那一面的冷补光，免得阴面塌成死黑
  const fill = new THREE.DirectionalLight(0x7fa6b6, 0.5);
  fill.position.set(-900, 220, -300);
  fill.target.position.set(-60, 60, 0);
  scene.add(hemi, moonLight, cityBack, cityBack.target, fill, fill.target);

  scene.fog = new THREE.FogExp2(0x0c141a, 0.00055);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, cityBack, fill },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
