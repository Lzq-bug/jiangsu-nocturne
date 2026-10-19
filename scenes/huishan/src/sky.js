import * as THREE from 'three';
import { glow, rand, rr } from './kit.js';
import * as T from './textures.js';

/** 月偏东南：低悬在锡山之上，二泉与直街都朝这一边借光 */
export const MOON_DIR = new THREE.Vector3(0.42, 0.44, 0.80).normalize();

/* ------------------------------------------------------------------ 天穹 */
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
        vec3 zenith = vec3(0.0050,0.0076,0.020);
        vec3 mid    = vec3(0.012,0.017,0.040);
        vec3 horizon= vec3(0.028,0.025,0.033);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        // 城镇灯 haze 聚在东面（运河口），山那边干净
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        float east = smoothstep(-0.4, 0.95, d.z*0.86 + d.x*0.4);
        col += vec3(0.040,0.021,0.008) * haze * (0.22 + 1.0*east);
        // 月晕
        float md = max(0.0, dot(d, normalize(vec3(0.42,0.44,0.80))));
        col += vec3(0.050,0.060,0.090) * pow(md, 22.0) * 0.95 * sky;
        col += vec3(0.020,0.024,0.040) * pow(md, 5.0) * 0.35 * sky;
        // 薄云
        float c = n(d.xz*6.0 + vec2(uTime*0.005, uTime*0.002)) * 0.62 + n(d.xz*15.0 - vec2(uTime*0.009,0.0))*0.38;
        col = mix(col, col + vec3(0.011,0.013,0.023), smoothstep(0.46,0.86,c) * smoothstep(0.02,0.32,d.y));
        col = mix(col, vec3(0.0034,0.0044,0.0085), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

export function stars() {
  const N = 1500, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.72) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 560, y * 560, Math.sin(a) * r * 560], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.3;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: T.softGlow('215,228,255', 0.05) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.6+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.86,0.9,1.0), t.a*vA*0.9); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(8.6, 24, 16), glow('#fff6dd', 1.85));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,242,210', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(86, 86, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(470);
  return grp;
}

/* ------------------------------------------------------------------ 雾带 */
function mistTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 64);
  for (let i = 0; i < 30; i++) {
    const y = rr(4, 60), w = rr(70, 240), h = rr(3, 10);
    const cx = rr(0, 256);
    const g = x.createLinearGradient(cx - w / 2, y, cx + w / 2, y);
    g.addColorStop(0, 'rgba(168,192,228,0)');
    g.addColorStop(0.5, `rgba(178,198,232,${rr(0.06, 0.2)})`);
    g.addColorStop(1, 'rgba(168,192,228,0)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(cx, y, w / 2, h, 0, 0, 7); x.fill();
  }
  // 上下沿化开，否则平铺的矩形边会在鸟瞰里变成硬块
  const v = x.createLinearGradient(0, 0, 0, 64);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(0.42, 'rgba(0,0,0,0.35)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = v; x.fillRect(0, 0, 256, 64);
  const h2 = x.createLinearGradient(0, 0, 256, 0);
  h2.addColorStop(0, 'rgba(0,0,0,1)');
  h2.addColorStop(0.12, 'rgba(0,0,0,0)');
  h2.addColorStop(0.88, 'rgba(0,0,0,0)');
  h2.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = h2; x.fillRect(0, 0, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 雾只留给远山。贴水的雾带在相机靠近后会变成一整面糊住画面的墙，
 * 水气交给水面着色器自己的天光反射与光柱去表达。
 */
function mistBands(scene) {
  const tex = mistTexture();
  const bands = [];
  const add = (w, d, x, z, y, opacity, speed) => {
    const m = new THREE.MeshBasicMaterial({
      map: tex.clone(), transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide,
    });
    m.toneMapped = false;
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 6;
    scene.add(mesh);
    bands.push({ mesh, mat: m, speed });
  };
  add(620, 120, -40, -300, 24, 0.24, 0.004);    // 惠山脚
  add(520, 120, 240, 120, 12, 0.14, 0.003);     // 运河口
  return bands;
}

/* ------------------------------------------------------------------ 灯光 */
function lights(scene) {
  const hemi = new THREE.HemisphereLight(0x46628f, 0x11151f, 0.78);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.0);
  moonLight.position.copy(MOON_DIR).multiplyScalar(200);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -230; sc.right = 230; sc.top = 230; sc.bottom = -230; sc.near = 30; sc.far = 560;
  moonLight.shadow.bias = -0.0014;
  moonLight.shadow.normalBias = 0.5;
  moonLight.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, moonLight);

  // 沿街、园池与寺门的暖光补光：位置都挑在机位看得见的大面上
  const fills = [
    [[2, 8, 60], 0xffa657, 260, 120],
    [[4, 8, 170], 0xffa657, 300, 130],
    [[4, 6, 214], 0xffbb77, 180, 84],
    [[-88, 12, -236], 0xffd9a4, 150, 62],
    [[-70, 11, -222], 0xffe6bd, 90, 40],
    [[58, 7, -158], 0xffcf94, 150, 66],
    [[44, 8, -126], 0xffd7a2, 120, 56],
    [[-22, 9, -66], 0xff9a5e, 190, 80],
    [[-22, 13, -118], 0xffab6b, 200, 92],
    [[-56, 66, 424], 0xffd39a, 2400, 300],
  ];
  const pts = fills.map(([p, color, i, dist]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });
  return { hemi, moonLight, pts };
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());
  const bands = mistBands(scene);
  const L = lights(scene);
  scene.fog = new THREE.FogExp2(0x0a1020, 0.0021);
  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: L,
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      for (const b of bands) {
        b.mat.map.offset.x = (t * b.speed) % 1;
        b.mesh.position.x += Math.sin(t * 0.06 + b.speed * 900) * 0.0035;
      }
    },
  };
}
