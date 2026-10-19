import * as THREE from 'three';
import { M, glow, box, mesh, rand, rr } from '../../src/kit.js';
import * as T from '../../src/textures.js';
import * as TT from './textures.js';
import { YARD, MOON_DIR } from './data.js';

export const MOON = new THREE.Vector3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z).normalize();
const SKY_R = 620;

export function buildEnvironment(scene) {
  scene.fog = new THREE.Fog(0x070b14, 30, 220);

  const uni = {
    uMoon: { value: MOON.clone() },
    uMoonI: { value: 1.2 },
    uTop: { value: new THREE.Color('#03050d') },
    uMid: { value: new THREE.Color('#0a1123') },
    uHorizon: { value: new THREE.Color('#19223a') },
    uCity: { value: new THREE.Color('#3d2c1d') },
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uMoon; uniform float uMoonI;
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uCity;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.34, up));
        col = mix(col, uTop, smoothstep(0.26, 0.92, up));
        // 城气：地平线一线暖灰，压在屋脊后面
        float band = exp(-pow((up - 0.02) * 7.4, 2.0));
        col += uCity * band * 0.34;
        float md = clamp(dot(d, uMoon), 0.0, 1.0);
        col += vec3(0.10, 0.13, 0.23) * pow(md, 7.0) * uMoonI;
        col += vec3(0.18, 0.21, 0.31) * pow(md, 26.0) * uMoonI;
        // 月面：边缘略软，落一点明暗不均
        float ang = acos(md);
        float disc = smoothstep(0.0165, 0.0120, ang);
        float sh = 0.84 + 0.16 * hash(floor(d.xy * 90.0));
        col = mix(col, vec3(1.62, 1.58, 1.44) * sh, disc);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 40, 24), skyMat);
  sky.name = 'sky';
  scene.add(sky);

  /* ------------------------------------------------------------------ 星 */
  const sp = [];
  for (let i = 0; i < 820; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.7) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    sp.push(Math.cos(a) * r * SKY_R * 0.94, y * SKY_R * 0.94, Math.sin(a) * r * SKY_R * 0.94);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 1.5, sizeAttenuation: false, color: 0xbcd0ff, transparent: true, opacity: 0.42,
    depthWrite: false, fog: false,
  }));
  scene.add(stars);

  /* --------------------------------------------------------------- 月华 */
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('226,236,255', 0.06), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, fog: false, opacity: 0.5,
  }));
  halo.material.toneMapped = false;
  halo.position.copy(MOON).multiplyScalar(SKY_R * 0.9);
  halo.scale.set(118, 118, 1);
  scene.add(halo);

  /* ------------------------------------------------------------- 薄云 */
  const clouds = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.SpriteMaterial({
      map: T.cloudPuff(), transparent: true, depthWrite: false, fog: false,
      color: 0x9fb0d0, opacity: 0.1 + rand() * 0.15,
    });
    mat.toneMapped = false;
    const s = new THREE.Sprite(mat);
    const a = MOON.clone().lerp(new THREE.Vector3(rr(-1, 1), 0.25, rr(-1, 1)), 0.45).normalize();
    const base = a.multiplyScalar(SKY_R * 0.86);
    s.position.copy(base);
    s.userData.base = base.clone();
    s.userData.phase = rand() * 6.28;
    s.userData.sway = rr(4, 16);
    s.scale.set(rr(90, 190), rr(30, 56), 1);
    clouds.add(s);
  }
  scene.add(clouds);

  /* ------------------------------------------------------------------ 光 */
  const hemi = new THREE.HemisphereLight(0x1b2740, 0x0a0d14, 0.5);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x0c1220, 0.4);
  scene.add(ambient);

  const moonLight = new THREE.DirectionalLight(0xaec6ee, 1.7);
  moonLight.position.copy(MOON).multiplyScalar(58);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const SC = 32;
  moonLight.shadow.camera.left = -SC;
  moonLight.shadow.camera.right = SC;
  moonLight.shadow.camera.top = SC;
  moonLight.shadow.camera.bottom = -SC;
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 170;
  moonLight.shadow.bias = -0.0006;
  moonLight.shadow.normalBias = 0.03;
  scene.add(moonLight);

  // 从月洞门挤进来的一道洗光，帮铺地起层次
  const wash = new THREE.SpotLight(0xcfe0ff, 46, 44, 0.75, 0.75, 1.6);
  wash.position.set(-7.6, 10.5, 21);
  wash.target.position.set(-2.0, 0.3, 3.0);
  scene.add(wash, wash.target);

  /* ------------------------------------------------------------------ 地 */
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#454b58', map: TT.brick('#4d5261'), roughness: 0.96,
    emissive: '#080b14', emissiveIntensity: 0.4,
  });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.05;
  outside.receiveShadow = true;
  scene.add(outside);

  scene.add(buildCity());
  scene.add(buildLane());

  return {
    uni, moonLight, hemi, ambient, halo, clouds, stars, wash, sky,
    update(t) {
      for (const c of clouds.children) {
        c.position.x = c.userData.base.x + Math.sin(t * 0.02 + c.userData.phase) * c.userData.sway;
      }
      halo.scale.setScalar(116 + Math.sin(t * 0.35) * 4);
    },
    /** 月色参数 0..2：天上、地上、水里一起亮 */
    setMoon(k) {
      uni.uMoonI.value = 0.5 + 0.95 * k;
      moonLight.intensity = 0.5 + 1.25 * k;
      hemi.intensity = 0.22 + 0.4 * k;
      ambient.intensity = 0.22 + 0.28 * k;
      wash.intensity = 14 + 40 * k;
      halo.material.opacity = 0.24 + 0.3 * k;
      if (M.paving) M.paving.emissiveIntensity = 0.28 + 0.4 * k;
    },
  };
}

/* ------------------------------------------------------------------ 城外 */

/** 围墙外的邻宅：夜里只剩剪影与几点窗 */
function buildCity() {
  const grp = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({
    color: '#171d2b', roughness: 0.95, emissive: '#080c16', emissiveIntensity: 0.5,
  });
  const winMat = new THREE.MeshBasicMaterial({
    map: T.lattice(3, 2), color: new THREE.Color('#ffd6a0').multiplyScalar(0.5),
  });
  winMat.toneMapped = false;

  for (let i = 0; i < 54; i++) {
    const a = rand() * Math.PI * 2;
    const dist = rr(27, 98);
    const w = rr(6, 13), d = rr(5, 11), h = rr(4.4, 9.5);
    const m = mesh(box(w, h, d, 0, h / 2, 0), dark);
    m.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
    m.rotation.y = rand() * 0.9;
    grp.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.7, rr(1.4, 2.6), 4), dark);
    cap.position.set(m.position.x, h + 0.8, m.position.z);
    cap.rotation.y = m.rotation.y + Math.PI / 4;
    grp.add(cap);
    if (rand() > 0.7) {
      const litWin = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
      litWin.position.set(m.position.x + w * 0.3, h * rr(0.4, 0.75), m.position.z + d * 0.55);
      litWin.rotation.y = m.rotation.y;
      grp.add(litWin);
    }
  }
  // 天际线上收两点高的：城里的塔与阁，只留剪影
  for (const [x, z, hh] of [[-74, -56, 19], [56, -78, 15], [88, 26, 17]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.6, hh, 6), dark);
    tower.position.set(x, hh / 2, z);
    grp.add(tower);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4, 6), dark);
    top.position.set(x, hh + 2, z);
    grp.add(top);
  }
  return grp;
}

/** 园门前的深巷：巷墙、石板道、对面屋檐、一盏巷灯、门前石鼓 */
function buildLane() {
  const grp = new THREE.Group();
  const z0 = YARD.wall.z + 0.4;
  const zMid = z0 + 8;

  const laneMat = new THREE.MeshStandardMaterial({
    color: '#565c6b', map: TT.brick('#5a6070'), roughness: 0.94,
    emissive: '#0a0e18', emissiveIntensity: 0.45,
  });
  laneMat.map = laneMat.map.clone();
  laneMat.map.repeat.set(0.16, 0.16);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(52, 30), laneMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, zMid + 6);
  road.receiveShadow = true;
  grp.add(road);

  // 巷两侧高墙，把视线收到门口
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#b6bcc9', map: TT.brick('#6f7583'), roughness: 0.95,
    emissive: '#0b1020', emissiveIntensity: 0.45,
  });
  for (const s of [-1, 1]) {
    const x = s * 13.5;
    const body = mesh(box(0.6, 5.0, 30, x, 2.5, zMid + 5), wallMat);
    body.castShadow = true; body.receiveShadow = true;
    grp.add(body);
    const cap = mesh(box(1.1, 0.26, 30.4, x, 5.12, zMid + 5), M.wallCap);
    grp.add(cap);
  }

  // 对面一串屋檐
  const dark = new THREE.MeshStandardMaterial({
    color: '#1d2433', roughness: 0.95, emissive: '#0a0e18', emissiveIntensity: 0.5,
  });
  for (let i = 0; i < 8; i++) {
    const h = rr(3.6, 5.6);
    const b = mesh(box(5.6, h, 5.2, -18 + i * 5.2, h / 2, z0 + 15.5), dark);
    grp.add(b);
    grp.add(mesh(box(6.2, 0.3, 5.8, -18 + i * 5.2, h + 0.15, z0 + 15.5), M.wallCap));
  }

  // 巷灯
  const post = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.7, 8), M.stoneDark);
  shaft.position.y = 1.85;
  post.add(shaft);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), glow('#d6e8ff', 2.4));
  head.position.y = 3.8;
  post.add(head);
  const lampHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('200,224,255', 0.1), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.5,
  }));
  lampHalo.material.toneMapped = false;
  lampHalo.scale.set(5, 5, 1);
  lampHalo.position.y = 3.8;
  post.add(lampHalo);
  post.position.set(YARD.gate.x + 5.4, 0, z0 + 7.2);
  grp.add(post);
  const pl = new THREE.PointLight(0xbfd8ff, 46, 26, 2);
  pl.position.set(post.position.x, 3.8, post.position.z);
  grp.add(pl);

  // 门前一对石鼓
  for (const s of [-1, 1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.78, 12), M.stoneDressed);
    drum.position.set(YARD.gate.x + s * 1.9, 0.39, z0 + 0.75);
    drum.castShadow = true;
    grp.add(drum);
    const capStone = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.stoneDressed);
    capStone.position.set(YARD.gate.x + s * 1.9, 0.78, z0 + 0.75);
    grp.add(capStone);
  }
  return grp;
}
