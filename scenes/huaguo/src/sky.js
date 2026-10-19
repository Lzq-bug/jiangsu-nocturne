import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';

/**
 * 月出东海：月亮在东-north-east 二十来度的高度上，所以西壁是背光的一面——
 * 那一面的亮度全靠一径山灯与山前街市回上来的暖光。云海带横在山腰以下，
 * 密度可调，浓时只剩下几处高点从云里冒出来。
 */
export const MOON_DIR = new THREE.Vector3(0.70, 0.33, -0.12).normalize();
export const CLOUD_Y = 392;
/** 三层高度错开：一张面永远画不出"云在足下"的厚度 */
export const CLOUD_LEVELS = [392, 404, 379];

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
        vec3 zenith  = vec3(0.0030,0.0048,0.0112);
        vec3 mid     = vec3(0.0105,0.0150,0.0300);
        vec3 horizon = vec3(0.0300,0.0345,0.0450);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.86,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.05, 0.09, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.2,0.0,1.0), 2.6) * sky;
        // 西面是街市压着的天空，东面是敞着的海：两边的地平不一样热
        float west = smoothstep(0.2, -0.95, d.x);
        float east = smoothstep(0.2, 0.95, d.x);
        col += vec3(0.070,0.036,0.014) * haze * (0.30 + 1.05*west);
        col += vec3(0.014,0.030,0.044) * haze * (0.35 + 0.75*east);
        // 月晕
        float md = max(0.0, dot(d, normalize(vec3(0.70,0.33,-0.12))));
        col += vec3(0.052,0.062,0.088) * pow(md, 46.0) * 1.2 * sky;
        col += vec3(0.016,0.020,0.030) * pow(md, 7.0) * 0.7 * sky;
        // 高空的薄云，贴着月走
        float c = n(d.xz*3.1 + vec2(uTime*0.0022, uTime*0.0013)) * 0.62
                + n(d.xz*8.6 - vec2(uTime*0.0041, 0.0)) * 0.38;
        float cl = smoothstep(0.47,0.90,c) * smoothstep(0.02,0.34,d.y);
        col = mix(col, col + vec3(0.020,0.023,0.036) + 0.10*pow(md, 30.0), cl);
        col = mix(col, vec3(0.0022,0.0032,0.0060), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(6500, 44, 26), mat);
  m.name = 'sky-dome';
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

/** 山上没有城市的光幕，星子比园子里那一场多得多 */
function stars() {
  const N = 900, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.16 + Math.pow(rand(), 0.72) * 0.84;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 6000, y * 6000, Math.sin(a) * r * 6000], i * 3);
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
      uTex: { value: T.softGlow('212,226,246', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.42+0.58*sin(uTime*1.15+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.7); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.86,0.90,1.0), t.a*vA*0.62); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(58, 24, 16), glow('#fff6dd', 1.9));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,241,209', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(760, 760, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(5600);
  return grp;
}

/**
 * 云海带：一张横在山腰以下的软面，靠噪声把边啃出来。它比地形矮，所以山是
 * 从云里冒出来的；它比灯高，所以灯只能在云下留一层透出来的暖。
 */
function cloudSea() {
  const uni = {
    uTime: { value: 0 }, uDensity: { value: 0.4 }, uMoon: { value: new THREE.Vector3() },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.FrontSide,
    blending: THREE.NormalBlending, uniforms: uni,
    vertexShader: `varying vec2 vW; void main(){
      vec4 wp = modelMatrix * vec4(position,1.0);
      vW = wp.xz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `
      varying vec2 vW; uniform float uTime; uniform float uDensity; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(121.7,311.3)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5;
        for(int i=0;i<5;i++){ s += a*n(p); p = p*2.07 + 13.1; a *= 0.5; } return s; }
      void main(){
        vec2 p = vW*0.00072 + vec2(uTime*0.0042, uTime*0.0016);
        float f = fbm(p);
        // 云铺在山腰以下的一切：近处也要有，只在画面的边上收掉
        float band = smoothstep(4200.0, 1500.0, length(vW*vec2(0.62,1.0)));
        // 脚下留一个洞：站在巅上时云该从远处起，不然整幅是一块平地板
        float near = smoothstep(260.0, 2100.0, length(vW - cameraPosition.xz));
        band *= mix(0.18, 1.0, near);
        float d = smoothstep(0.60 - 0.30*uDensity, 0.94 - 0.14*uDensity, f) * (0.30 + 0.70*uDensity);
        d *= band;
        if (d < 0.01) discard;
        float top = smoothstep(0.30, 0.95, f);
        vec3 col = mix(vec3(0.062,0.080,0.118), vec3(0.34,0.38,0.46), top);
        // 西面街市映上来的一层暖
        col += vec3(0.088,0.042,0.014) * top * smoothstep(300.0, -1600.0, vW.x);
        // 东面月下来的那一条亮脊
        vec2 md = normalize(vec2(uMoon.x, uMoon.z) + vec2(0.0001, 0.0001));
        col += vec3(0.13,0.15,0.19) * top * pow(max(0.0, dot(md, normalize(vW + vec2(0.0001)))), 10.0);
        gl_FragColor = vec4(col, d*0.88);
      }`,
  });
  // 三层共一张材质，靠平面各自平移取不同的世界坐标噪声，不必复制 uniform
  const sheets = CLOUD_LEVELS.map((y, i) => {
    const g = new THREE.PlaneGeometry(8600, 8600, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set((i - 1) * 1500, y, (i - 1) * -1100);
    m.renderOrder = 6;
    m.frustumCulled = false;
    m.name = `cloud-layer-${i}`;
    return m;
  });
  const grp = new THREE.Group();
  grp.name = 'cloud-sea';
  for (const s of sheets) grp.add(s);
  return { mesh: grp, sheets, uni };
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  const cs = cloudSea();
  cs.uni.uMoon.value.copy(MOON_DIR);
  scene.add(sky.mesh, star.mesh, moon(), cs.mesh);

  const hemi = new THREE.HemisphereLight(0x53749c, 0x1d2428, 3.0);
  const moonLight = new THREE.DirectionalLight(0xc6dcf8, 2.7);
  moonLight.position.copy(MOON_DIR).multiplyScalar(2200);
  // 月在山后，西壁主要吃的是天光与海面回上来的冷反光
  const skyBounce = new THREE.DirectionalLight(0x9dbde0, 2.5);
  skyBounce.position.set(-2600, 1100, 500);
  skyBounce.target.position.set(-100, 300, 0);
  // 山前的街把暖光送回西壁
  const townBack = new THREE.DirectionalLight(0xff9a58, 0.42);
  townBack.position.set(-2400, 120, 300);
  townBack.target.position.set(-200, 260, 0);
  // 东面敞海给一面冷补光，阴面才不至于死黑
  const fill = new THREE.DirectionalLight(0x7fa6b8, 0.5);
  fill.position.set(1800, 700, -900);
  fill.target.position.set(0, 300, 0);
  scene.add(hemi, moonLight, skyBounce, skyBounce.target, townBack, townBack.target, fill, fill.target);

  scene.fog = new THREE.FogExp2(0x1b2530, 0.000155);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, skyBounce, townBack, fill },
    cloud: cs,
    setStarBright(v) { star.uni.uBright.value = v; },
    setCloud(v) {
      const d = Math.max(0, Math.min(1.6, v));
      cs.mesh.visible = d > 0.01;
      for (const s of cs.sheets) s.material.uniforms.uDensity.value = d;
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      for (const s of cs.sheets) s.material.uniforms.uTime.value = t;
    },
  };
}
