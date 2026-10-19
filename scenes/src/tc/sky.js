import * as THREE from 'three';
import { glow, rand, rr } from '../kit.js';
import * as T from '../textures.js';

/** 月挂在湖的西北：城墙的北面被擦亮，南面留在暗里 */
export const MOON_DIR = new THREE.Vector3(-0.52, 0.56, -0.65).normalize();

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
        vec3 zenith = vec3(0.0050,0.0080,0.0215);
        vec3 mid    = vec3(0.0125,0.0180,0.0420);
        vec3 horizon= vec3(0.0290,0.0255,0.0350);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        // 城南的灯火把天脚烘暖，湖那一面只剩一层冷光
        float city = smoothstep(-0.2, 0.95, d.z*0.9 - abs(d.x)*0.15);
        col += vec3(0.040,0.019,0.007) * haze * (0.30 + 1.05*city);
        float lake = smoothstep(0.85, -0.1, d.z) * smoothstep(0.55, 0.0, abs(d.x));
        col += vec3(0.010,0.015,0.028) * haze * lake;
        float md = max(0.0, dot(d, normalize(vec3(-0.52,0.56,-0.65))));
        col += vec3(0.058,0.070,0.105) * pow(md, 26.0) * 0.9 * sky;
        // 云：在球面上取两组近似圆形的采样，避免拉成竖直的光柱
        float c = n(vec2(d.x, d.y*1.6)*7.0 + vec2(uTime*0.005, 0.0)) * 0.35
                + n(vec2(d.z, d.y*1.6)*7.0 - vec2(uTime*0.008, 0.0)) * 0.35
                + n(d.xz*17.0) * 0.3;
        col = mix(col, col + vec3(0.006,0.008,0.015), smoothstep(0.52,0.92,c) * smoothstep(0.02,0.32,d.y));
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.SphereGeometry(620, 32, 20);
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, uni };
}

export function stars() {
  const N = 1500;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.7) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 540, y * 540, Math.sin(a) * r * 540], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.4;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: T.softGlow('210,225,255', 0.05) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.6+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.85,0.9,1.0), t.a*vA*0.9); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), glow('#fff4d6', 2.3));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(155, 155, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(450);
  grp.position.y = Math.max(130, grp.position.y);
  return grp;
}

/** 方位角：0 为正北（-Z），向东为正；下面的山体都按这套角摆 */
const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const bump = (a, center, width, height) => height * Math.exp(-((a - center) ** 2) / (2 * width * width));

/**
 * 远山。方位按南京实景：东面钟山（紫金山）最厚，西北幕府、狮子两山接住湖的出口，
 * 正北湖面开向长江所以压得低，南面是城。起伏的分量是写意。
 */
function farRidge(a) {
  const x = wrap(a);
  let h = 12;
  h += bump(x, 1.05, 0.62, 96);
  h += bump(x, -0.78, 0.34, 52);
  h += bump(x, -1.42, 0.30, 40);
  h += bump(x, 2.5, 0.5, 30);
  h += 7 * Math.sin(x * 5.3) + 4 * Math.sin(x * 11.1 + 1.4);
  return Math.max(6, h);
}

/** 近处一圈：只在东北起一道丘（九华山一带），湖面上不许长山 */
function nearRidge(a) {
  const x = wrap(a);
  return Math.max(-12, bump(x, 1.0, 0.38, 27) + bump(x, 1.5, 0.3, 15) - 12);
}

function silhouette(R, heightFn, colorLow, colorHigh, seg = 180) {
  const pts = [], col = [], idx = [];
  const cLow = new THREE.Color(colorLow), cHigh = new THREE.Color(colorHigh);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * R, z = -Math.sin(a) * R;
    const h = heightFn(a);
    pts.push(x, -14, z, x, h, z);
    col.push(...cLow.toArray(), ...cHigh.toArray());
    if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  m.toneMapped = false;
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

/** 山脊上零星几盏庙亭灯，让黑山不是空的 */
function ridgeLights(R, heightFn) {
  const pts = [];
  for (let i = 0; i < 22; i++) {
    const a = rr(0.35, 1.9);
    const r = R * rr(0.88, 0.99);
    pts.push(Math.cos(a) * r, heightFn(a) * rr(0.7, 0.92) + 1, -Math.sin(a) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pts), 3));
  const m = new THREE.PointsMaterial({
    map: T.softGlow('255,206,150', 0.25), size: 5.5, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  return new THREE.Points(g, m);
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());
  scene.add(silhouette(540, farRidge, '#04060d', '#0f1626'));
  scene.add(silhouette(340, nearRidge, '#05070f', '#141c30'));
  scene.add(ridgeLights(340, nearRidge));

  const hemi = new THREE.HemisphereLight(0x3a4a70, 0x0c1017, 0.42);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.15);
  moonLight.position.copy(MOON_DIR).multiplyScalar(190);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 30; sc.far = 420;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.5;
  scene.add(moonLight);

  // 城与寺的暖光补在低处，砖面才不是一块黑
  const fills = [
    [[-30, 27, 6], 0xffb877, 150, 90],
    [[120, 12, 92], 0xff9d5c, 210, 96],
    [[-186, 7, -22], 0xffb877, 130, 70],
    [[-60, 2, -74], 0xffca88, 110, 66],
    [[60, 3, -74], 0xffca88, 110, 66],
  ];
  const lights = fills.map(([p, color, intensity, dist]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x0a1124, 0.0034);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights,
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
