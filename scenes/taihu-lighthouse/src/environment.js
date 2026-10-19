import * as THREE from 'three';
import { M, glow, rand, rr } from './kit.js';
import { GEO } from './data.js';
import * as T from './textures.js';

/**
 * 夜里的太湖西北岸。与河道夜景不同的是：视野的一半是水面，
 * 月亮与落日同在一个方向（西南偏西），城市的光害穹顶在背后（东北）。
 */

/** 月光方向：低悬在湖面上，约 24° 仰角，偏西南 */
export const MOON_DIR = new THREE.Vector3(-0.6, 0.42, 0.68).normalize();
/** 无锡城区在东北方向，夜里天上最亮的那一块在它背后 */
const CITY_DIR = new THREE.Vector3(0.62, 0, -0.78).normalize();
/** 湖对岸（马山、西山岛一线）在南与西，剪影只围这一段弧 */
const FAR_SIDE = new THREE.Vector3(-0.42, 0, 0.9);

/** 水面 shader 自己算远处的那层雾，必须和 scene.fog 同源，否则地平线会断层 */
export const FOG = { color: new THREE.Color(0x0a1120), density: 0.00038 };

function skyDome() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      uniform vec3 uMoon; uniform vec3 uCity;
      // 云必须用三维噪声：按 d.xz 采样等于对仰角无依赖，地平线附近会被拉成竖直条带
      float h3(vec3 p){ return fract(sin(dot(p, vec3(27.1,61.7,113.5)))*43758.5453); }
      float n3(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        float a = mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y);
        float b = mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y);
        return mix(a, b, f.z);
      }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0032,0.0050,0.0145);
        vec3 mid    = vec3(0.0085,0.013,0.032);
        vec3 horizon= vec3(0.017,0.020,0.031);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.82,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.04, 0.10, d.y);
        float low = pow(clamp(1.0-abs(d.y)*2.2,0.0,1.0), 2.4) * sky;
        // 城市光害：贴着地平线的一团暖橙，背后东北方向最亮
        float city = max(0.0, dot(d, uCity));
        col += vec3(0.040,0.021,0.010) * low * pow(city, 2.2) * 1.2;
        // 湖面上的冷光：月光照在水面再反射上来，地平线偏蓝
        float lake = max(0.0, dot(normalize(vec3(d.x,0.0,d.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.010,0.016,0.030) * low * pow(lake, 1.6);
        // 月晕
        col += vec3(0.062,0.076,0.11) * pow(max(0.0, dot(d, uMoon)), 30.0) * 1.1 * sky;
        // 高空薄云，向月面一侧被照亮
        float c = n3(d*5.0 + vec3(uTime*0.0035, 0.0, uTime*0.0012)) * 0.6
                + n3(d*13.0 - vec3(uTime*0.006, 0.0, 0.0)) * 0.4;
        float cl = smoothstep(0.52,0.88,c) * smoothstep(0.03,0.32,d.y);
        col = mix(col, col + mix(vec3(0.008,0.010,0.018), vec3(0.030,0.036,0.052), pow(max(0.0,dot(d,uMoon)),3.0)), cl);
        // 地平线以下交给雾色本身
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
    uniforms: {
      uTime: uni.uTime,
      uMoon: { value: MOON_DIR.clone() },
      uCity: { value: CITY_DIR.clone() },
    },
  });
  // 穹顶必须罩住整个视野：湖面要到地平线，比河道场景大一整个量级
  const g = new THREE.Mesh(new THREE.SphereGeometry(5200, 40, 24), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function stars() {
  const N = 2600, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.045 + Math.pow(rand(), 0.62) * 0.95;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 4600, y * 4600, Math.sin(a) * r * 4600], i * 3);
    size[i] = 0.8 + Math.pow(rand(), 3) * 4.2;
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
      void main(){ vA = (0.45+0.55*sin(uTime*1.5+aPhase)) * uBright;
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
  const disc = new THREE.Mesh(new THREE.SphereGeometry(46, 28, 18), glow('#fff6dd', 2.6));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(250, 250, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(4300);
  return grp;
}

/** 湖对岸：只围南—西一段弧的山脊剪影，前面缀几粒村灯 */
function farRidge() {
  const pts = [], col = [], idx = [];
  const seg = 150;
  const cLow = new THREE.Color('#050810'), cHigh = new THREE.Color('#0d1626');
  const base = Math.atan2(FAR_SIDE.z, FAR_SIDE.x);
  for (let i = 0; i <= seg; i++) {
    const f = i / seg;
    const a = base - 2.05 + f * 4.1;
    const x = Math.cos(a), z = Math.sin(a);
    const bump = Math.abs(Math.sin(a * 2.3 + 1.1)) * 46 + Math.abs(Math.sin(a * 6.1)) * 22 + Math.sin(a * 11.3) * 9;
    const R = 2280 + Math.sin(a * 3.7) * 260;
    const h = 34 + bump;
    pts.push(x * R, -12, z * R, x * R, h, z * R);
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

  // 岸线渔村灯：贴在山脚那一圈，亮度不足以照亮任何东西，只证明湖有人
  const lp = [];
  for (let i = 0; i < 150; i++) {
    const a = base - 1.95 + rand() * 3.9;
    const R = 2120 + rand() * 90;
    lp.push(Math.cos(a) * R, 3 + rand() * 9, Math.sin(a) * R);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
  const lm = new THREE.PointsMaterial({
    map: T.softGlow('255,206,150', 0.2), size: 13, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  lm.toneMapped = false;
  const grp = new THREE.Group();
  grp.add(mesh, new THREE.Points(lg, lm));
  return grp;
}

/** 低空薄云，压在湖面上，靠月那一侧发亮 */
function cloudBank() {
  const grp = new THREE.Group();
  const tex = T.cloudPuff();
  for (let i = 0; i < 9; i++) {
    const m = new THREE.SpriteMaterial({
      map: tex, color: 0x9fb0d0, transparent: true, opacity: 0.14 + rand() * 0.12,
      depthWrite: false, fog: false, blending: THREE.NormalBlending,
    });
    m.toneMapped = false;
    const s = new THREE.Sprite(m);
    const a = Math.atan2(FAR_SIDE.z, FAR_SIDE.x) + rr(-1.5, 1.5);
    const R = 1500 + rand() * 900;
    s.position.set(Math.cos(a) * R, 90 + rand() * 180, Math.sin(a) * R);
    const w = 700 + rand() * 900;
    s.scale.set(w, w * 0.24, 1);
    s.userData.drift = 3 + rand() * 6;
    grp.add(s);
  }
  return grp;
}

/** 石咀后方（北、东）的丘岗剪影：把镜头往回摇时不至于看见虚空 */
function backHills() {
  const grp = new THREE.Group();
  const dummy = new THREE.Object3D();
  const geo = new THREE.SphereGeometry(1, 10, 7);
  const n = 46;
  const im = new THREE.InstancedMesh(geo, M.grassDark, n);
  for (let i = 0; i < n; i++) {
    const a = rr(-1.2, 2.6);          // 从北到东
    const R = 640 + rand() * 220;
    const x = Math.sin(a) * R, z = -Math.cos(a) * R;
    const h = 40 + rand() * 60, w = 130 + rand() * 190;
    dummy.position.set(x, -8, z);
    dummy.scale.set(w, h, w * 0.8);
    dummy.rotation.set(0, rand() * 3, 0);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
  grp.add(im);
  return grp;
}

/** 岸边路灯式的环境补光：不做主角，只让近处的石头有明暗 */
function fills(scene) {
  const list = [
    [[GEO.light.x, GEO.light.padY + 9, GEO.light.z], 0xffd9a8, 220, 120],   // 灯塔台地
    [[GEO.pier.x, 12, GEO.pier.z], 0xffb877, 180, 110],                     // 码头
    [[GEO.bridge.x, 12, GEO.bridge.z], 0xffcf94, 150, 120],                  // 长春桥
    [[GEO.grove.x, 20, GEO.grove.z], 0xffd0e0, 260, 190],                    // 樱花谷
    [[GEO.platform.x, 16, GEO.platform.z], 0xbcd2ff, 120, 140],               // 尖端平台（以月光为主）
  ];
  return list.map(([p, color, i, dist]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  const clouds = cloudBank();
  scene.add(sky.mesh, star.mesh, moon(), farRidge(), backHills(), clouds);

  const hemi = new THREE.HemisphereLight(0x3f5f92, 0x0a0f16, 0.62);
  const moonLight = new THREE.DirectionalLight(0xbcd4ff, 1.7);
  moonLight.position.copy(MOON_DIR).multiplyScalar(420);
  moonLight.target.position.set(0, 0, 150);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -300; sc.right = 300; sc.top = 300; sc.bottom = -300; sc.near = 60; sc.far = 900;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.9;
  scene.add(hemi, moonLight, moonLight.target);

  const lamps = fills(scene);

  scene.fog = new THREE.FogExp2(0x0a1120, 0.00038);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    setStarBright(v) { star.uni.uBright.value = v; },
    setLampIntensity(k, v) {
      lamps.forEach((l, i) => { if (i === k) l.intensity = v; });
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      for (const c of clouds.children) {
        c.position.x += c.userData.drift * 0.016;
        if (c.position.x > 2400) c.position.x = -2400;
      }
    },
  };
}

export { FAR_SIDE, CITY_DIR };
