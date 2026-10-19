import * as THREE from 'three';
import { PONDS, pondOutline } from './data.js';
import { M, PAL, glow, lit, rand, rr, rgb } from './kit.js';
import * as T from './textures.js';

/**
 * 一轮偏西北的下弦月：塔影、鸳鸯馆的水面、远香堂望出去的方向都被它扫到。
 * 所有方向光/天空/水面掠射都共用这个常量，改它等于改全园的明暗关系。
 */
export const MOON_DIR = new THREE.Vector3(-0.62, 0.38, -0.68).normalize();

/* ------------------------------------------------------------------ sky */

function skyDome() {
  const uni = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0050, 0.0075, 0.0195);
        vec3 mid = vec3(0.0125, 0.0175, 0.0400);
        vec3 horizon = vec3(0.0290, 0.0255, 0.0330);
        vec3 col = mix(zenith, mid, smoothstep(0.5, 0.82, up));
        col = mix(col, horizon, smoothstep(0.52, 0.32, up));
        float sky = smoothstep(-0.04, 0.08, d.y);
        float haze = pow(clamp(1.0 - abs(d.y) * 2.5, 0.0, 1.0), 2.3) * sky;
        // 苏州的夜气：东南城廓压一层暖，西北留给月与塔
        float warm = smoothstep(-0.3, 0.95, d.x * 0.72 - d.z * 0.32);
        col += vec3(0.036, 0.017, 0.007) * haze * (0.3 + 0.95 * warm);
        col += vec3(0.014, 0.020, 0.030) * haze * (1.0 - warm) * 0.7;
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.058, 0.070, 0.100) * pow(md, 24.0) * 0.95 * sky;
        col += vec3(0.030, 0.036, 0.056) * pow(md, 5.0) * 0.28 * sky;
        float c = n(d.xz * 6.5 + vec2(uTime * 0.005, 0.0)) * 0.6 + n(d.xz * 15.0 - vec2(uTime * 0.009, 0.0)) * 0.4;
        col = mix(col, col + vec3(0.010, 0.013, 0.023), smoothstep(0.46, 0.86, c) * smoothstep(0.02, 0.32, d.y));
        col = mix(col, vec3(0.0032, 0.0042, 0.0080), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(720, 36, 22), mat);
  mesh.frustumCulled = false;
  return { mesh, uni };
}

function stars() {
  const N = 1200;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.1 + Math.pow(rand(), 0.72) * 0.88;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 640, y * 640, Math.sin(a) * r * 640], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 3) * 3.0;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
    vertexShader: `
      attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR;
      varying float vA;
      void main(){
        vA = 0.35 + 0.65 * pow(abs(sin(uTime * 0.45 + aPhase)), 2.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPR;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float m = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vec3(0.62, 0.68, 0.86) * m * vA * 1.3, m * vA);
      }`,
  });
  mat.toneMapped = false;
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { pts, mat };
}

function moonDisc() {
  const grp = new THREE.Group();
  const dir = MOON_DIR.clone().multiplyScalar(560);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('214,228,248', 0.05), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.material.toneMapped = false;
  halo.scale.setScalar(150);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('238,244,255', 0.55), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  disc.material.toneMapped = false;
  disc.scale.setScalar(30);
  grp.add(halo, disc);
  grp.position.copy(dir);
  return { grp, halo, disc };
}

/* ------------------------------------------------- 园外：城廓与报恩寺塔（借景） */

function skyline() {
  const grp = new THREE.Group();
  grp.name = 'skyline';
  const dark = lit('#141a26', { rough: 1, emissive: '#0a0e18', ei: 0.7 });
  const edge = lit('#232c3c', { rough: 1, emissive: '#131b2a', ei: 0.8 });
  // 环园一圈黑屋脊，远处偶见一点窗灯
  const R = 300;
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * Math.PI * 2 + rr(-0.02, 0.02);
    const dist = R * rr(0.9, 1.24);
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    const w = rr(14, 34), h = rr(5, 15), d = rr(9, 20);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dark);
    body.position.set(x, h / 2 - 1, z);
    body.rotation.y = -a + rr(-0.3, 0.3);
    grp.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.62, h * 0.34, 4), edge);
    roof.position.set(x, h + h * 0.14 - 1, z);
    roof.rotation.set(0, Math.PI / 4 - a, 0);
    grp.add(roof);
    if (rand() < 0.32) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), glow(PAL.lanternWarm, 1.1));
      win.position.set(x + Math.cos(-a) * (d / 2 + 0.1), h * rr(0.3, 0.7), z + Math.sin(-a) * (d / 2 + 0.1));
      win.rotation.y = -a;
      grp.add(win);
    }
  }
  // 报恩寺塔（北寺塔）：九级八面，砖身木檐，高约 76 米——按写意尺度放在西北城外
  const tower = new THREE.Group();
  const tiers = 9;
  const H = 74;
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1);
    const r = 7.6 * (1 - k * 0.52);
    const th = H / tiers * 0.78;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, th, 8), dark);
    body.position.y = y + th / 2;
    tower.add(body);
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.32, r * 1.16, th * 0.2, 8), edge);
    eave.position.y = y + th;
    tower.add(eave);
    y += th + th * 0.12;
    if (i % 2 === 0) {
      const light = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), glow('#e8b57a', 0.75));
      light.position.set(0, y - th * 0.7, r * 1.02);
      tower.add(light);
    }
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 9, 6), glow('#c9a86a', 0.5));
  spire.position.y = y + 4;
  tower.add(spire);
  // 塔身压在西北方向，与园内的塔影亭、俯瞰机位同一条视线
  tower.position.set(-196, 0, -244);
  tower.scale.setScalar(1.35);
  grp.add(tower);
  return { grp, tower };
}

/* ------------------------------------------------------------------ 池上夜雾 */

function mistOver(scene) {
  const grp = new THREE.Group();
  grp.name = 'mist';
  const map = T.mistStreaks();
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const items = [];
  for (const def of PONDS) {
    const pts = pondOutline(def);
    const [cx, cz] = def._center;
    let rx = 0;
    for (const p of pts) rx = Math.max(rx, Math.hypot(p[0] - cx, p[1] - cz));
    const count = Math.max(5, Math.round(rx / 4));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map, transparent: true, opacity: rr(0.06, 0.14), depthWrite: false, fog: true,
        color: rgb('#9fb6cc'), blending: THREE.AdditiveBlending,
      }));
      m.material.toneMapped = false;
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * rx * 0.9;
      m.position.set(cx + Math.cos(a) * d, rr(0.45, 2.0), cz + Math.sin(a) * d);
      m.scale.set(rx * rr(1.1, 2.0), 1, rx * rr(0.4, 0.7));
      m.rotation.y = rand() * Math.PI * 2;
      m.userData = {
        spin: rr(-0.012, 0.012), bob: rand() * 6.28, base: rr(0.05, 0.15),
        x0: m.position.x, z0: m.position.z,
      };
      grp.add(m);
      items.push(m);
    }
  }
  scene.add(grp);
  return {
    grp, items,
    update(t) {
      for (const m of items) {
        const u = m.userData;
        m.position.x = u.x0 + Math.sin(t * 0.06 + u.bob) * 2.4;
        m.position.z = u.z0 + Math.cos(t * 0.05 + u.bob) * 2.0;
        m.rotation.y += u.spin * 0.016;
        m.material.opacity = u.base * (0.55 + 0.45 * Math.sin(t * 0.12 + u.bob));
      }
    },
  };
}

/* ------------------------------------------------------------------ assemble */

export function buildEnvironment(scene) {
  scene.fog = new THREE.FogExp2(new THREE.Color('#0a1220'), 0.0034);

  const sky = skyDome();
  scene.add(sky.mesh);
  const starField = stars();
  scene.add(starField.pts);
  const moon = moonDisc();
  scene.add(moon.grp);
  const city = skyline();
  scene.add(city.grp);

  // 月：全园唯一的主光，影子要能读出屋檐的层次
  const key = new THREE.DirectionalLight(new THREE.Color('#b9cfe8'), 1.15);
  key.position.copy(MOON_DIR.clone().multiplyScalar(150));
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const cam = key.shadow.camera;
  cam.left = -120; cam.right = 120; cam.top = 110; cam.bottom = -110;
  cam.near = 20; cam.far = 340;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.6;
  scene.add(key, key.target);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#33456a'), new THREE.Color('#101a14'), 0.95);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(new THREE.Color('#1a2436'), 0.72));

  // 四个片区的补光：宅园、中部水面、西部、东园与游廊
  const accents = [
    new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 62, 46, 2),
    new THREE.PointLight(new THREE.Color('#9fd6ff'), 46, 54, 2),
    new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 58, 44, 2),
    new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 44, 40, 2),
  ];
  accents[0].position.set(80, 5.4, 47);
  accents[1].position.set(4, 7.5, 6);
  accents[2].position.set(-70, 6.4, 19);
  accents[3].position.set(40, 5.2, 38);
  // 香洲是昆曲那一幕的舞台，单独给一盏贴水的暖光
  const stage = new THREE.PointLight(new THREE.Color(PAL.lanternWarm), 70, 26, 2);
  stage.position.set(-16, 2.6, -8);
  accents.push(stage);
  accents.forEach((a) => scene.add(a));

  const mist = mistOver(scene);

  return {
    sky, stars: starField, moon, city, mist, fog: scene.fog,
    key, hemi, accents,
    setMist(v) {
      mist.items.forEach((m) => { m.visible = v; });
    },
    setQuality(level) {
      key.castShadow = level < 2;
      starField.pts.visible = level < 2;
    },
    update(t) {
      sky.uni.uTime.value = t;
      starField.mat.uniforms.uTime.value = t;
      mist.update(t);
      // 月晕随湿度轻微起伏，别是一潭死水
      moon.halo.material.opacity = 0.78 + 0.1 * Math.sin(t * 0.22);
      moon.grp.position.copy(MOON_DIR.clone().multiplyScalar(560));
    },
  };
}
