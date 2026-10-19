/**
 * 环境：夜天、月、星、云海、山雾、远山剪影与全部真实光源。
 *
 * 山岳夜景的成本在灯不在面：这一景里成百上千盏"上山灯"一律是发光面 + 加色 Sprite，
 * 真实 PointLight 只留六盏（山门、印宫、老子像、顶宫、洞府、盘山道各一），
 * 否则 SwiftShader 下一张静帧要跑十分钟。
 */
import * as THREE from 'three';
import { glow, lit, rand, rr } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { EXTENT, FOOT_Y, MOUNT, CLOUD } from './data.js';

/** 月偏西北、高度约 26°：山门北望时月落在主峰左肩后（构图所需，非史实） */
export const MOON_DIR = new THREE.Vector3(-0.52, 0.46, -0.72).normalize();

function skyDome() {
  const uni = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() }, uHaze: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon; uniform float uHaze;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0042,0.0068,0.0190);
        vec3 mid    = vec3(0.0110,0.0165,0.0390);
        vec3 horizon= vec3(0.0290,0.0310,0.0430);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.82,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.05, 0.06, d.y);
        // 山里的地平雾是冷水汽，不是镇上灯火
        float band = pow(clamp(1.0-abs(d.y)*1.7,0.0,1.0), 2.6) * sky;
        col += vec3(0.026,0.034,0.046) * band * uHaze;
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.055,0.068,0.100) * pow(md, 22.0) * sky;
        col += vec3(0.018,0.023,0.036) * pow(md, 4.0) * sky * 0.6;
        float c = n(d.xz*8.0 + vec2(uTime*0.004, 0.0)) * 0.6 + n(d.xz*19.0 - vec2(uTime*0.008,0.0))*0.4;
        col = mix(col, col + vec3(0.006,0.008,0.014), smoothstep(0.52,0.95,c) * smoothstep(0.0,0.34,d.y));
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(EXTENT * 0.9, 32, 20), mat);
  mesh.frustumCulled = false;
  return { mesh, uni };
}

function stars(n = 1700) {
  const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.06 + Math.pow(rand(), 0.68) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const R = EXTENT * 0.82;
    pos.set([Math.cos(a) * r * R, y * R, Math.sin(a) * r * R], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.6;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: TX.softGlow('210,225,255', 0.05) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.6+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.86,0.9,1.0), t.a*vA*0.95); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d6').multiplyScalar(2.4), fog: false });
  m.toneMapped = false;
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(15, 24, 16), m));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(170, 170, 1);
  grp.add(halo);
  grp.position.copy(MOON_DIR).multiplyScalar(EXTENT * 0.74);
  return { mesh: grp, halo };
}

/**
 * 云海：铺在山脚以外的一片高度带。近处不生成（否则山门机位头顶全是云），
 * 远处与谷地越密，峰顶机位往下看就是"山浮在海上"。
 */
function cloudSea() {
  const uni = {
    uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() },
    uLevel: { value: CLOUD.y }, uTop: { value: CLOUD.thickness },
    uInner: { value: CLOUD.inner }, uOuter: { value: CLOUD.outer },
    uBright: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: uni,
    vertexShader: `varying vec3 vW;
      void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      varying vec3 vW; uniform float uTime, uLevel, uTop, uInner, uOuter, uBright; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.07; a*=0.5;} return s; }
      void main(){
        float d = length(vW.xz);
        float cover = smoothstep(uInner, uInner*1.5, d) * (1.0 - smoothstep(uOuter*0.8, uOuter, d));
        vec2 q = vW.xz*0.0032 + vec2(uTime*0.0035, -uTime*0.0021);
        float f = fbm(q) * 0.62 + fbm(q*2.7 + 11.0) * 0.38;
        float a = smoothstep(0.40, 0.74, f);
        // 云面上的月：面向月亮那一侧偏亮，背光侧压成青灰
        float top = smoothstep(0.0, 0.35, f);
        vec3 litCol = mix(vec3(0.14,0.17,0.25), vec3(0.52,0.58,0.72), top);
        float md = max(0.0, dot(normalize(vec3(uMoon.x, 0.0, uMoon.z)), normalize(vW.xz - vec3(0.0))));
        litCol += vec3(0.20,0.19,0.16) * pow(md, 3.0) * top;
        gl_FragColor = vec4(litCol * uBright, a * cover * 0.92);
      }`,
  });
  const g = new THREE.PlaneGeometry(EXTENT * 2.1, EXTENT * 2.1, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.y = CLOUD.y;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  // 云面上沿：同一张 shader 换个高度与亮度，做出厚度的边
  const lip = new THREE.Mesh(g.clone(), mat);
  lip.position.y = CLOUD.y + CLOUD.thickness * 0.55;
  lip.renderOrder = 1;
  lip.scale.set(0.86, 1, 0.86);
  return { mesh, lip, uni };
}

/** 远山剪影：一圈越来越淡的山脊，用柱壳上沿做轮廓 */
function farRanges() {
  const grp = new THREE.Group();
  const layers = [
    { r: EXTENT * 0.62, h: 0.17, tone: 0.055, y: FOOT_Y + 6 },
    { r: EXTENT * 0.78, h: 0.13, tone: 0.040, y: FOOT_Y + 4 },
    { r: EXTENT * 0.92, h: 0.10, tone: 0.030, y: FOOT_Y + 3 },
  ];
  for (const L of layers) {
    const N = 96, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const bump = Math.abs(Math.sin(a * 2.6 + L.r)) * 0.6 + Math.abs(Math.sin(a * 5.3 + 1.1)) * 0.3 + 0.22;
      const h = L.h * L.r * bump;
      pos.push(Math.cos(a) * L.r, L.y, Math.sin(a) * L.r, Math.cos(a) * L.r, L.y + h, Math.sin(a) * L.r);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 远景体块不能是全黑：#1b2130 一线，月光打得上的那种灰
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#1b2231').multiplyScalar(0.55 + L.tone * 8), side: THREE.DoubleSide, fog: true });
    mat.toneMapped = false;
    grp.add(new THREE.Mesh(g, mat));
  }
  return grp;
}

/** 山雾：贴在坡面上的几层半透明片，夜里只吃月光与宫观的灯光 */
function mistBands() {
  const grp = new THREE.Group();
  const tex = TX.cloudPuff();
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: new THREE.Color('#5f7488'), transparent: true, opacity: 0.05 + rand() * 0.06,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    const a = rand() * Math.PI * 2;
    const r = 110 + Math.pow(rand(), 0.7) * EXTENT * 0.3;
    s.position.set(Math.cos(a) * r, FOOT_Y + 26 + Math.pow(rand(), 1.4) * 150, Math.sin(a) * r);
    const w = 120 + rand() * 260;
    s.scale.set(w, w * 0.32, 1);
    grp.add(s);
  }
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  const moonObj = moon();
  const sea = cloudSea();
  const mist = mistBands();
  scene.add(sky.mesh, star.mesh, moonObj.mesh, farRanges(), sea.mesh, sea.lip, mist);

  const hemi = new THREE.HemisphereLight(0x3c5c86, 0x0e1319, 0.62);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.0);
  moonLight.position.copy(MOON_DIR).multiplyScalar(600);
  scene.add(hemi, moonLight);

  // 山体自照：月光只从西北来，东南坡全靠这两盏洗
  const washWarm = new THREE.PointLight(0xffb070, 1500, 900, 2);
  washWarm.position.set(220, FOOT_Y + 120, 480);
  const washCool = new THREE.PointLight(0x9fc0ff, 1100, 950, 2);
  washCool.position.set(-320, FOOT_Y + 260, -320);
  scene.add(washWarm, washCool);

  scene.fog = new THREE.FogExp2(0x0b1220, 0.00085);

  return {
    uni: { sky: sky.uni, stars: star.uni, cloud: sea.uni },
    cloudSea: sea,
    setMoon(v) {
      moonLight.intensity = 1.0 * v;
      hemi.intensity = 0.62 * (0.55 + 0.45 * v);
      star.uni.uBright.value = 1 - 0.42 * Math.min(1, v);
      moonObj.halo.material.opacity = 0.48 + 0.4 * v;
      sea.uni.uBright.value = 0.55 + 0.55 * v;
      sky.uni.uHaze.value = 0.7 + 0.5 * v;
      washWarm.intensity = 1500 * (0.5 + 0.5 * v);
      washCool.intensity = 1100 * (0.45 + 0.55 * v);
    },
    /** 云海滑条：0 收得只剩峰头，1 漫到山腰 */
    setCloud(v) {
      const inner = CLOUD.inner * (0.55 + 1.1 * (1 - v));
      sea.uni.uInner.value = inner;
      sea.uni.uBright.value = (0.4 + 0.9 * v) * 1.1;
      sea.mesh.visible = v > 0.02;
      sea.lip.visible = v > 0.02;
    },
    setMist(v) {
      mist.visible = v > 0.02;
      mist.children.forEach((s, i) => {
        s.material.opacity = (0.05 + 0.06 * ((i % 5) / 5 + 0.4)) * v;
      });
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      sea.uni.uTime.value = t;
    },
  };
}

export { glow };
