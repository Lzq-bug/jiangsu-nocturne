/**
 * 环境：夜天、月、地坪与驳岸、平原地平雾带、远处镇陌剪影、岸柳与古槐。
 * 东台地处滨海平原，四望无山——这里不画山影，只留一条低屋脊与地平雾带。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, rand, rr, registerOccluder } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import * as T from './textures.js';
import { RIVER, GROUND_Y, YARD, DIKE_Y, STATIONS } from './data.js';

/** 月在北偏西、高度 23°：南岸堤顶北望时正好落在塔刹之后（构图所需，非史实） */
export const MOON_DIR = new THREE.Vector3(-0.095, 0.39, -0.915).normalize();

function skyDome() {
  const uni = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0050,0.0078,0.0210);
        vec3 mid    = vec3(0.0125,0.0170,0.0400);
        vec3 horizon= vec3(0.0310,0.0260,0.0330);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        // 平原地平线上摊着一层镇上的灯火雾
        float haze = pow(clamp(1.0-abs(d.y)*1.9,0.0,1.0), 2.4) * sky;
        float warm = smoothstep(-0.35, 0.85, d.x*0.55 + d.z*0.6);
        col += vec3(0.036,0.017,0.006) * haze * (0.4 + 0.85*warm);
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.052,0.064,0.095) * pow(md, 24.0) * sky;
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.0045,0.006,0.011), smoothstep(0.55,0.92,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function stars() {
  const N = 1500;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.7) * 0.92;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 520, y * 520, Math.sin(a) * r * 520], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.4;
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
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.85,0.9,1.0), t.a*vA*0.9); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d6').multiplyScalar(2.3), fog: false });
  m.toneMapped = false;
  const disc = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 16), m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(112, 112, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(430);
  grp.position.y = Math.max(110, grp.position.y);
  return { mesh: grp, halo };
}

/** 地平雾带：平原上没有山，只有越来越亮的一条低线 */
function horizonHaze() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, uniforms: uni,
    vertexShader: `varying float vY; varying float vA;
      void main(){ vY = position.y; vA = atan(position.z, position.x);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying float vY; varying float vA;
      void main(){
        float band = smoothstep(-2.0, 16.0, vY) * (1.0 - smoothstep(14.0, 42.0, vY));
        float town = 0.5 + 0.5*sin(vA*2.3 + 1.1);
        vec3 c = mix(vec3(0.055,0.028,0.012), vec3(0.030,0.036,0.062), town);
        gl_FragColor = vec4(c, band * (0.16 + 0.20*town));
      }`,
  });
  const g = new THREE.CylinderGeometry(430, 430, 46, 40, 1, true);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.y = 4;
  mesh.frustumCulled = false;
  return mesh;
}

/** 远处镇陌：低屋脊剪影 + 窗针，只沿东南一面铺开 */
function farTown() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 340;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x070a12, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const d = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    const a = rr(-0.35, 2.9) + Math.PI * 0.1;
    const band = 118 + Math.pow(rand(), 0.6) * 150;
    const x = Math.cos(a) * band, z = Math.sin(a) * band;
    const h = 4 + rand() * 9, w = 6 + rand() * 8;
    d.position.set(x, h * 0.5, z);
    d.rotation.set(0, rand() * Math.PI, 0);
    d.scale.set(w, h, w * 0.72);
    d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    d.position.set(x, h + 1.2, z);
    d.scale.set(w * 0.78, 2.8 + rand() * 1.8, w * 0.6);
    d.updateMatrix();
    roofs.setMatrixAt(i, d.matrix);
    if (rand() > 0.6) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.6, z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: TX.softGlow('255,200,140', 0.2), size: 3.0, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/* ------------------------------------------------------------------ 地坪、驳岸与南岸河堤 */
function ground() {
  const grp = new THREE.Group();
  grp.name = 'ground';
  const mat = lit('#8f8874', { map: T.yardGround(), rough: 0.98, emissive: '#0d0f12', ei: 0.35 });
  const n = RIVER.at - RIVER.halfWidth - 1.2;
  const s = RIVER.at + RIVER.halfWidth + 1.2;

  const field = new THREE.Mesh(new THREE.PlaneGeometry(320, n + 170), mat);
  field.geometry.rotateX(-Math.PI / 2);
  field.position.set(0, GROUND_Y, (n - 170) / 2);
  field.receiveShadow = true;
  grp.add(field);

  // 南岸作一道河堤（滨海平原上的捍海堰遗风，此处只作写意），堤顶 y = DIKE_Y
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(320, 170 - (s + 5.4)), mat);
  walk.geometry.rotateX(-Math.PI / 2);
  walk.position.set(0, DIKE_Y, (s + 5.4 + 170) / 2);
  walk.receiveShadow = true;
  grp.add(walk);
  const slope = new THREE.Mesh(new THREE.BoxGeometry(320, 0.5, 6.2), mat);
  slope.rotation.x = -Math.atan2(DIKE_Y - 0.6, 5.4);
  slope.position.set(0, (DIKE_Y + 0.6) / 2, s + 2.9);
  slope.receiveShadow = true;
  grp.add(slope);

  // 石驳岸：两岸各一道竖壁 + 顶压石
  const stone = lit('#9aa0ac', { map: TX.stone('#7e8492'), rough: 0.92 });
  for (const [z, top] of [[n, GROUND_Y], [s, 0.7]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(320, top + 0.9, 0.9), stone);
    wall.position.set(0, (top - 0.9) / 2, z);
    wall.receiveShadow = true;
    const coping = new THREE.Mesh(new THREE.BoxGeometry(320, 0.22, 1.5), stone);
    coping.position.set(0, top + 0.06, z + (z > 0 ? 0.4 : -0.4));
    grp.add(wall, coping);
  }
  return { grp, stone, mat };
}

/* ------------------------------------------------------------------ 树 */
function willowGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.48, 4.6, 7);
  trunk.translate(0, 2.3, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.16, 2.2, 5);
    br.translate(0, 4.9 + i * 0.15, 0);
    br.rotateZ((i - 1) * 0.7);
    br.rotateY(i * 2.1);
    parts.push(br);
  }
  // 先给一团冠，再垂丝：夜里只有几根管的柳树看着像铁丝架
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.SphereGeometry(1.15 + rand() * 0.5, 7, 5);
    blob.scale(1.25, 0.5, 1.25);
    blob.translate(Math.cos(i * 1.7) * 0.9, 4.6 + rand() * 0.5, Math.sin(i * 1.7) * 0.9);
    parts.push(blob);
  }
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2, r = 1.4 + rand() * 2.4;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.32, 4.7 + rand() * 1.0, Math.sin(a) * r * 0.32),
      new THREE.Vector3(Math.cos(a) * r * 0.8, 4.2 + rand() * 0.8, Math.sin(a) * r * 0.8),
      new THREE.Vector3(Math.cos(a) * r, 2.4 + rand() * 1.2, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * r * 1.02, 0.7 + rand() * 0.9, Math.sin(a) * r * 1.02),
    ]);
    parts.push(new THREE.TubeGeometry(c, 6, 0.028 + rand() * 0.026, 3, false));
  }
  return mergeGeometries(parts);
}

function pagodaTreeGeo() {
  // 塔院里的古槐：伞形树冠，几团扁球叠成
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.34, 0.6, 3.4, 7);
  trunk.translate(0, 1.7, 0);
  parts.push(trunk);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.SphereGeometry(1.5 + rand(), 8, 6);
    b.scale(1.25, 0.62, 1.25);
    b.translate(Math.cos(i * 1.9) * 1.5, 4.1 + rand() * 0.7, Math.sin(i * 1.9) * 1.5);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

function trees() {
  const grp = new THREE.Group();
  const leaf = lit('#1c2a1b', { rough: 0.97, side: THREE.DoubleSide, emissive: '#070d07', ei: 0.35 });
  const wGeo = willowGeo();
  const locust = pagodaTreeGeo();
  const s = RIVER.at + RIVER.halfWidth + 1.2;
  const put = (geo, mat, x, y, z, sc, occl = 4.6) => {
    // 树不能长在机位上：离任何一处机位 9 m 以内一律不摆
    if (!STATIONS.every((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) > 9)) return null;
    const t = new THREE.Mesh(geo, mat);
    t.scale.set(sc, sc * rr(0.92, 1.12), sc);
    t.position.set(x, y, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, occl, new THREE.Vector3(x, 0, z)));
    return t;
  };
  // 堤上一排柳：都在机位背后或两侧，不再插进街市与院墙之间
  for (let x = -70; x <= 70; x += 13) {
    if (rand() > 0.3) put(wGeo, leaf, x + rr(-3, 3), DIKE_Y, s + rr(5.8, 8.5), rr(0.75, 1.15));
  }
  // 院西、院东两块空地上的柳
  for (let i = 0; i < 5; i++) put(wGeo, leaf, rr(-40, -30), GROUND_Y, rr(-22, 8), rr(0.7, 1.05));
  for (let i = 0; i < 4; i++) put(wGeo, leaf, rr(14, 21), GROUND_Y, rr(-20, -6), rr(0.7, 1.05));
  // 塔院古槐：离机位视线远一点，别糊成一片
  for (const [x, z] of [[-22, 6], [12, -14]]) put(locust, leaf, x, GROUND_Y, z, rr(0.82, 0.98), 7);
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  const moonObj = moon();
  const g = ground();
  scene.add(sky.mesh, star.mesh, moonObj.mesh, horizonHaze(), farTown(), g.grp, trees());

  const hemi = new THREE.HemisphereLight(0x46608f, 0x0d1018, 0.5);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.05);
  moonLight.position.copy(MOON_DIR).multiplyScalar(170);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 90; sc.bottom = -60; sc.near = 20; sc.far = 380;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  scene.add(hemi, moonLight);

  scene.fog = new THREE.FogExp2(0x0a1024, 0.0044);

  // 塔身北面的一盏冷补光，让密檐在月下有余部可看
  const wash = new THREE.PointLight(0xbfd4ff, 60, 46, 2);
  wash.position.set(-6, 12, -14);
  scene.add(wash);
  // 东南侧一盏暖光：从南岸看塔时，砖身得有体积，不能只是一片剪影
  const towerFill = new THREE.PointLight(0xffa860, 320, 86, 2);
  towerFill.position.set(9, 9.5, 13);
  scene.add(towerFill);

  return {
    ground: g.grp,
    uni: { sky: sky.uni, stars: star.uni },
    setMoon(v) {
      moonLight.intensity = 1.05 * v;
      hemi.intensity = 0.5 * v;
      star.uni.uBright.value = 1 - 0.45 * Math.min(1, v);
      moonObj.halo.material.opacity = 0.5 + 0.35 * v;
      wash.intensity = 60 * (0.45 + 0.55 * v);
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}

export { YARD };
