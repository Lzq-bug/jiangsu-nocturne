import * as THREE from 'three';
import { SEASONS, GARDEN, HOUSE } from './data.js';
import { PAL, lit, glow, rr, rand, rgb } from './kit.js';
import * as T from './textures.js';

/**
 * 夜空、月、扬州城廓与夜雾，外加本片的招牌：四季月色分区。
 * 一轮月是全园主光，四组假山之前各悬一盏同色温的月灯——
 * 春青、夏蓝、秋橙、冬白，走过山色随之换档，这是艺术处理而非天象。
 */

export const MOON_DIR = new THREE.Vector3(-0.46, 0.46, 0.76).normalize();

/* ------------------------------------------------------------------ sky */

function skyDome() {
  const uni = {
    uTime: { value: 0 },
    uMoon: { value: MOON_DIR.clone() },
    uHumid: { value: 0.6 },
    uMoonTint: { value: new THREE.Color('#cfe2f7') },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon; uniform float uHumid; uniform vec3 uMoonTint;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0048, 0.0072, 0.0188);
        vec3 mid = vec3(0.0120, 0.0168, 0.0382);
        vec3 horizon = vec3(0.0295, 0.0258, 0.0322);
        vec3 col = mix(zenith, mid, smoothstep(0.5, 0.82, up));
        col = mix(col, horizon, smoothstep(0.52, 0.32, up));
        float sky = smoothstep(-0.04, 0.08, d.y);
        float haze = pow(clamp(1.0 - abs(d.y) * 2.5, 0.0, 1.0), 2.3) * sky;
        // 园墙外是盐阜东路的街市：东南一线压住暖光，西北留给月
        float town = smoothstep(-0.4, 0.9, d.x * 0.55 + d.z * 0.78);
        col += vec3(0.042, 0.020, 0.008) * haze * (0.28 + 1.05 * town) * (1.0 - uHumid * 0.22);
        col += vec3(0.013, 0.019, 0.029) * haze * (1.0 - town) * 0.72;
        float md = max(0.0, dot(d, uMoon));
        col += uMoonTint * pow(md, 26.0) * 0.92 * sky * (0.55 + uHumid * 0.5);
        col += uMoonTint * pow(md, 5.0) * 0.24 * sky * (0.45 + uHumid * 0.75);
        float c = n(d.xz * 6.5 + vec2(uTime * 0.005, 0.0)) * 0.6 + n(d.xz * 15.0 - vec2(uTime * 0.009, 0.0)) * 0.4;
        col = mix(col, col + vec3(0.010, 0.013, 0.022), smoothstep(0.46, 0.86, c) * smoothstep(0.02, 0.32, d.y) * uHumid);
        col = mix(col, vec3(0.0030, 0.0040, 0.0078), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(680, 34, 20), mat);
  mesh.frustumCulled = false;
  return { mesh, uni };
}

function stars() {
  const N = 1100;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.12 + Math.pow(rand(), 0.7) * 0.86;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 600, y * 600, Math.sin(a) * r * 600], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 3) * 2.8;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uAmp: { value: 1 } },
    vertexShader: `
      attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR; uniform float uAmp;
      varying float vA;
      void main(){
        vA = (0.3 + 0.7 * pow(abs(sin(uTime * 0.4 + aPhase)), 2.0)) * uAmp;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPR;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float m = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vec3(0.62, 0.68, 0.86) * m * vA * 1.25, m * vA);
      }`,
  });
  mat.toneMapped = false;
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { pts, mat };
}

function moonDisc() {
  const grp = new THREE.Group();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('214,228,248', 0.05), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.material.toneMapped = false;
  halo.scale.setScalar(130);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('238,244,255', 0.55), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  disc.material.toneMapped = false;
  disc.scale.setScalar(26);
  grp.add(halo, disc);
  grp.position.copy(MOON_DIR.clone().multiplyScalar(520));
  return { grp, halo, disc };
}

/* ------------------------------------------------- 园墙外：扬州的民居屋脊 */

function skyline() {
  const grp = new THREE.Group();
  grp.name = 'skyline';
  const dark = lit('#121826', { rough: 1, emissive: '#0a0e18', ei: 0.7 });
  const edge = lit('#212a3a', { rough: 1, emissive: '#121a28', ei: 0.8 });
  for (let i = 0; i < 92; i++) {
    const a = (i / 92) * Math.PI * 2 + rr(-0.02, 0.02);
    const dist = rr(150, 240);
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist + 20;
    const w = rr(11, 26), h = rr(4, 11), d = rr(8, 16);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dark);
    body.position.set(x, h / 2 - 0.6, z);
    body.rotation.y = -a + rr(-0.3, 0.3);
    grp.add(body);
    // 硬山屋脊：一条正脊压两坡
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.5, d * 0.42), edge);
    roof.position.set(x, h - 0.4, z);
    roof.rotation.y = body.rotation.y;
    grp.add(roof);
    if (rand() < 0.3) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), glow(PAL.lanternWarm, 0.9));
      win.position.set(x + Math.cos(body.rotation.y) * (d / 2 + 0.1), h * rr(0.3, 0.6), z + Math.sin(body.rotation.y) * (d / 2 + 0.1));
      win.rotation.y = body.rotation.y;
      grp.add(win);
    }
  }
  return grp;
}

/* ------------------------------------------------------------------ 夜雾 */

function groundMist(scene) {
  const grp = new THREE.Group();
  grp.name = 'mist';
  const map = T.mistStreaks();
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const items = [];
  const beds = [
    [GARDEN.pond.cx, GARDEN.pond.cz, 34, 22, 13],
    [GARDEN.summer.cx, GARDEN.summer.cz + 4, 24, 16, 8],
    [GARDEN.spring.cx, GARDEN.spring.cz, 26, 10, 7],
    [GARDEN.winter.cx, GARDEN.winter.cz, 24, 10, 6],
    [GARDEN.autumn.cx - 6, GARDEN.autumn.cz + 6, 20, 14, 5],
    [-2, 24, 20, 8, 4],
  ];
  for (const [cx, cz, rx, rz, count] of beds) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map, transparent: true, opacity: rr(0.05, 0.12), depthWrite: false, fog: true,
        color: rgb('#9fb6cc'), blending: THREE.AdditiveBlending,
      }));
      m.material.toneMapped = false;
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand());
      m.position.set(cx + Math.cos(a) * rx * 0.5 * d, rr(0.4, 2.2), cz + Math.sin(a) * rz * 0.5 * d);
      m.scale.set(rx * rr(0.6, 1.2), 1, rz * rr(0.5, 0.9));
      m.rotation.y = rand() * Math.PI * 2;
      m.userData = { spin: rr(-0.01, 0.01), bob: rand() * 6.28, base: rr(0.045, 0.13), x0: m.position.x, z0: m.position.z };
      grp.add(m);
      items.push(m);
    }
  }
  scene.add(grp);
  return {
    grp, items,
    setWet(k) { for (const m of items) m.material.opacity = m.userData.base * k; },
    update(t, wet) {
      for (const m of items) {
        const u = m.userData;
        m.position.x = u.x0 + Math.sin(t * 0.05 + u.bob) * 2.2;
        m.position.z = u.z0 + Math.cos(t * 0.042 + u.bob) * 1.8;
        m.rotation.y += u.spin * 0.016;
        m.material.opacity = u.base * wet * (0.55 + 0.45 * Math.sin(t * 0.11 + u.bob));
      }
    },
  };
}

/* ------------------------------------------------------------------ 四季月色 */

const HILLS = {
  spring: [GARDEN.spring.cx, 3.2, GARDEN.spring.cz],
  summer: [GARDEN.summer.cx, GARDEN.summer.h * 0.8, GARDEN.summer.cz],
  autumn: [GARDEN.autumn.cx, GARDEN.autumn.h * 0.9, GARDEN.autumn.cz],
  winter: [GARDEN.winter.cx, GARDEN.winter.h * 0.8, GARDEN.winter.cz],
};

export function buildEnvironment(scene, anchors = {}) {
  scene.fog = new THREE.FogExp2(new THREE.Color(SEASONS[0].fog), SEASONS[0].density);

  const sky = skyDome();
  scene.add(sky.mesh);
  const starField = stars();
  scene.add(starField.pts);
  const moon = moonDisc();
  scene.add(moon.grp);
  const city = skyline();
  scene.add(city);
  const mist = groundMist(scene);

  // 月：全园唯一的主光
  const key = new THREE.DirectionalLight(new THREE.Color(SEASONS[0].key), 1.18);
  key.position.copy(MOON_DIR.clone().multiplyScalar(150));
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const cam = key.shadow.camera;
  cam.left = -110; cam.right = 110; cam.top = 120; cam.bottom = -110;
  cam.near = 30; cam.far = 340;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.6;
  scene.add(key, key.target);

  const hemi = new THREE.HemisphereLight(new THREE.Color(SEASONS[0].hemiSky), new THREE.Color(SEASONS[0].hemiGround), 0.86);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(new THREE.Color('#121a2a'), 0.62);
  scene.add(ambient);

  // 四山之前各一盏月灯：本季的亮，其余压到三成
  const zones = {};
  for (const s of SEASONS) {
    const [x, y, z] = HILLS[s.id];
    const L = new THREE.PointLight(new THREE.Color(s.accent), s.accentI * 0.3, 58, 2);
    L.position.set(x, y, z);
    scene.add(L);
    zones[s.id] = L;
  }
  // 建筑与门灯的暖光：不受季节调度，只管把粉墙读出层次
  const warmSpots = [
    anchors.gate, anchors.lane, anchors.yuxuan, anchors.louyue, anchors.congshu, anchors.house,
  ].filter(Boolean);
  const warms = warmSpots.map(([x, y, z]) => {
    const L = new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 20, 26, 2);
    L.position.set(x, y, z);
    scene.add(L);
    return L;
  });
  /* 火巷是南北向的一条缝，月光落不进去——只能靠巷灯自己把它照亮 */
  const lane = HOUSE.lane;
  const laneLights = [46, 62, 76].map((z) => {
    const L = new THREE.PointLight(new THREE.Color('#ffbe86'), 9, 13, 2);
    L.position.set(lane.x, 2.7, z);
    scene.add(L);
    return L;
  });
  const gateCarveLight = new THREE.PointLight(new THREE.Color('#ffd9a8'), 13, 9, 2);
  gateCarveLight.position.set(lane.x, 2.4, lane.zFrom + 1.2);
  scene.add(gateCarveLight);

  /* 当前值向目标值缓动，机位一走动月色就跟着换挡 */
  const cur = {
    key: new THREE.Color(SEASONS[0].key),
    hemiSky: new THREE.Color(SEASONS[0].hemiSky),
    hemiGround: new THREE.Color(SEASONS[0].hemiGround),
    fog: new THREE.Color(SEASONS[0].fog),
    density: SEASONS[0].density,
    humid: SEASONS[0].wet,
    lantern: SEASONS[0].lanternI,
    stars: 1,
  };
  let target = SEASONS[0];
  let current = SEASONS[0];
  const moonTint = new THREE.Color(SEASONS[0].key);

  function setSeason(id, { snap = false } = {}) {
    const s = SEASONS.find((x) => x.id === id) || SEASONS[0];
    target = s;
    current = s;
    if (snap) {
      cur.key.set(s.key); cur.hemiSky.set(s.hemiSky); cur.hemiGround.set(s.hemiGround);
      cur.fog.set(s.fog); cur.density = s.density; cur.humid = s.wet; cur.lantern = s.lanternI;
    }
  }

  let moonBias = 1;
  let mistGain = 1;

  return {
    sky, stars: starField, moon, city, mist, fog: scene.fog,
    key, hemi, ambient, zones, warms,
    /** 季节本名与文案：ui 直接显示这一行 */
    get seasonId() { return current.id; },
    get season() { return current; },
    setSeason,
    setMoonBias(v) { moonBias = v; },
    setMistGain(v) { mistGain = v; },
    get lanternFactor() { return cur.lantern; },
    setMist(v) { mist.grp.visible = !!v; },
    setQuality(level) {
      key.castShadow = level < 2;
      starField.pts.visible = level < 2;
      warms.forEach((w, i) => { w.visible = level < 2 || i < 3; });
    },
    update(t, dt) {
      const k = Math.min(1, dt * 1.6);
      cur.key.lerp(new THREE.Color(target.key), k);
      cur.hemiSky.lerp(new THREE.Color(target.hemiSky), k);
      cur.hemiGround.lerp(new THREE.Color(target.hemiGround), k);
      cur.fog.lerp(new THREE.Color(target.fog), k);
      cur.density += (target.density - cur.density) * k;
      cur.humid += (target.wet - cur.humid) * k;
      cur.lantern += (target.lanternI - cur.lantern) * k;
      cur.stars += ((target.id === 'autumn' ? 1.5 : target.id === 'summer' ? 0.4 : 1) - cur.stars) * k;

      key.color.copy(cur.key).multiplyScalar(moonBias);
      hemi.color.copy(cur.hemiSky);
      hemi.groundColor.copy(cur.hemiGround);
      scene.fog.color.copy(cur.fog);
      scene.fog.density = cur.density;
      sky.uni.uTime.value = t;
      sky.uni.uHumid.value = cur.humid;
      moonTint.copy(cur.key);
      sky.uni.uMoonTint.value.copy(moonTint);
      starField.mat.uniforms.uTime.value = t;
      starField.mat.uniforms.uAmp.value = cur.stars;
      moon.halo.material.opacity = 0.55 + 0.28 * cur.humid + 0.08 * Math.sin(t * 0.22);
      moon.disc.material.color.copy(moonTint);
      moon.halo.material.color.copy(moonTint);
      moon.grp.position.copy(MOON_DIR.clone().multiplyScalar(520));

      for (const s of SEASONS) {
        const want = s.id === target.id ? s.accentI : s.accentI * 0.28;
        zones[s.id].intensity += (want - zones[s.id].intensity) * k;
      }
      // 冬夜灯暖要压一档，夏夜的暖才显出来
      const warmI = 20 * (0.62 + 0.42 * cur.lantern);
      for (const w of warms) w.intensity += (warmI - w.intensity) * k;
      mist.update(t, cur.humid * mistGain);
    },
  };
}
