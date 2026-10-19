/**
 * 环境：夜天、月、地坪（开出河汊、池沼与探方三口子）、驳岸、远处城与山、树。
 *
 * 南京不是平原四望——城南有聚宝山、雨花台一带低丘，故远景除城垣剪影外另铺暗山脊；
 * 月放在西北高空，自南向北望时正落在塔刹之后，这是构图，不是史实。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, rand, rr, registerOccluder } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import * as T from './textures.js';
import { GROUND_Y, RIVER, POOL, PIT, ARCH, STATIONS } from './data.js';

/** 月在西北、高约 21°：南岸河上北望时落在塔后 */
export const MOON_DIR = new THREE.Vector3(-0.22, 0.36, -0.9).normalize();

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
        vec3 mid    = vec3(0.0125,0.0170,0.0420);
        vec3 horizon= vec3(0.0330,0.0270,0.0340);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        // 城南市火在地平上摊成一层暖雾，偏南（+Z）一侧更亮
        float haze = pow(clamp(1.0-abs(d.y)*1.9,0.0,1.0), 2.4) * sky;
        float warm = smoothstep(-0.4, 0.9, d.z*0.75 + d.x*0.3);
        col += vec3(0.038,0.018,0.006) * haze * (0.35 + 0.9*warm);
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.052,0.064,0.095) * pow(md, 24.0) * sky;
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.0045,0.006,0.011), smoothstep(0.55,0.92,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), mat);
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
  const disc = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(120, 120, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(440);
  grp.position.y = Math.max(105, grp.position.y);
  return { mesh: grp, halo };
}

/** 地平雾带：城南火市偏暖，城北城墙一带偏冷 */
function horizonHaze() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying float vY; varying float vA;
      void main(){ vY = position.y; vA = atan(position.x, position.z);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying float vY; varying float vA;
      void main(){
        float band = smoothstep(-2.0, 16.0, vY) * (1.0 - smoothstep(14.0, 46.0, vY));
        // vA 是绕水平圈的角：0 在 +Z（南），π 在 -Z（北）
        float south = smoothstep(1.4, 3.0, abs(vA));
        vec3 c = mix(vec3(0.058,0.030,0.013), vec3(0.026,0.034,0.060), south);
        float flick = 0.92 + 0.08*sin(vA*7.0 + uTime*0.6);
        gl_FragColor = vec4(c, band * (0.18 + 0.16*(1.0-south)) * flick);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(440, 440, 50, 44, 1, true), mat);
  mesh.position.y = 4;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * 地坪：一整块带三个洞的铺地——香水河（横贯）、放生池、探方。
 * ShapeGeometry 的 uv 就是米制坐标，所以贴图 repeat 取 1/每几米一块。
 */
function ground() {
  const grp = new THREE.Group();
  grp.name = 'ground';
  const map = T.paving();
  map.repeat.set(0.45, 0.45);
  const mat = lit('#7d7869', { map, rough: 0.97, emissive: '#151310', ei: 0.34 });

  const northZ = RIVER.at - RIVER.halfWidth - 1.2;
  const southZ = RIVER.at + RIVER.halfWidth + 1.2;

  // ShapeGeometry 在 XY 面，rotateX(-π/2) 把 shape 的 +y 转成世界的 -z，
  // 所以北界（z = northZ）要写成 y = -northZ，南界（z = -110）写成 y = +110
  const yard = new THREE.Shape();
  yard.moveTo(-170, -northZ);
  yard.lineTo(170, -northZ);
  yard.lineTo(170, 110);
  yard.lineTo(-170, 110);
  yard.closePath();
  for (const [x0, x1, z0, z1] of [
    [POOL.x0, POOL.x1, -POOL.z1, -POOL.z0],
    [PIT.x0, PIT.x1, -PIT.z1, -PIT.z0],
  ]) {
    const hole = new THREE.Path();
    hole.moveTo(x0, z0); hole.lineTo(x1, z0); hole.lineTo(x1, z1); hole.lineTo(x0, z1);
    hole.closePath();
    yard.holes.push(hole);
  }
  const yardMesh = new THREE.Mesh(new THREE.ShapeGeometry(yard), mat);
  yardMesh.geometry.rotateX(-Math.PI / 2);
  yardMesh.position.y = GROUND_Y;
  yardMesh.receiveShadow = true;
  grp.add(yardMesh);

  // 河以南的街地市地
  const street = new THREE.Mesh(new THREE.PlaneGeometry(340, 170 - southZ), mat);
  street.geometry.rotateX(-Math.PI / 2);
  street.position.set(0, GROUND_Y, (southZ + 170) / 2);
  street.receiveShadow = true;
  grp.add(street);

  // 驳岸：河岸两道竖壁 + 顶压石，池壁四道
  const stone = lit('#9aa0ac', { map: TX.stone('#7e8492'), rough: 0.92 });
  for (const z of [northZ, southZ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(340, GROUND_Y + 0.9, 1.0), stone);
    wall.position.set(0, (GROUND_Y - 0.9) / 2, z);
    wall.receiveShadow = true;
    const coping = new THREE.Mesh(new THREE.BoxGeometry(340, 0.24, 1.7), stone);
    coping.position.set(0, GROUND_Y + 0.08, z + (z > RIVER.at ? 0.5 : -0.5));
    grp.add(wall, coping);
  }
  const pw = POOL.x1 - POOL.x0, pd = POOL.z1 - POOL.z0;
  grp.add(new THREE.Mesh(mergeGeometries([
    boxWall(pw + 1.4, 1.3, 0.7, (POOL.x0 + POOL.x1) / 2, GROUND_Y - 0.65, POOL.z0 - 0.35),
    boxWall(pw + 1.4, 1.3, 0.7, (POOL.x0 + POOL.x1) / 2, GROUND_Y - 0.65, POOL.z1 + 0.35),
    boxWall(0.7, 1.3, pd, POOL.x0 - 0.35, GROUND_Y - 0.65, (POOL.z0 + POOL.z1) / 2),
    boxWall(0.7, 1.3, pd, POOL.x1 + 0.35, GROUND_Y - 0.65, (POOL.z0 + POOL.z1) / 2),
  ]), stone));

  return { grp, stone, mat };
}

function boxWall(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/* ------------------------------------------------------------ 树 */
function ginkgoGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.5, 5.6, 7);
  trunk.translate(0, 2.8, 0);
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.SphereGeometry(1.3 + rand() * 0.6, 7, 5);
    b.scale(0.9, 1.35, 0.9);
    b.translate(Math.cos(i * 1.9) * 1.3, 5.4 + rand() * 1.5, Math.sin(i * 1.9) * 1.3);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

function willowGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.46, 4.4, 7);
  trunk.translate(0, 2.2, 0);
  parts.push(trunk);
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.SphereGeometry(1.1 + rand() * 0.4, 7, 5);
    blob.scale(1.25, 0.5, 1.25);
    blob.translate(Math.cos(i * 1.7) * 0.9, 4.5 + rand() * 0.5, Math.sin(i * 1.7) * 0.9);
    parts.push(blob);
  }
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2, r = 1.3 + rand() * 2.2;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.3, 4.5 + rand() * 0.9, Math.sin(a) * r * 0.3),
      new THREE.Vector3(Math.cos(a) * r * 0.8, 3.9 + rand() * 0.7, Math.sin(a) * r * 0.8),
      new THREE.Vector3(Math.cos(a) * r, 2.1 + rand() * 1.1, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * r * 1.02, 0.6 + rand() * 0.8, Math.sin(a) * r * 1.02),
    ]);
    parts.push(new THREE.TubeGeometry(c, 6, 0.026 + rand() * 0.024, 3, false));
  }
  return mergeGeometries(parts);
}

function trees() {
  const grp = new THREE.Group();
  const leaf = lit('#20301f', { rough: 0.97, side: THREE.DoubleSide, emissive: '#080e08', ei: 0.32 });
  const gin = ginkgoGeo(), wil = willowGeo();
  const southBank = RIVER.at + RIVER.halfWidth + 1.2;
  const put = (geo, x, y, z, sc, occl = 4.6) => {
    // 树不能长在机位上，也不能糊在镜头前：离任何机位 9 m 以内不摆
    if (!STATIONS.every((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) > 9)) return null;
    const t = new THREE.Mesh(geo, leaf);
    t.scale.set(sc, sc * rr(0.92, 1.12), sc);
    t.position.set(x, y, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, occl, new THREE.Vector3(x, 0, z)));
    return t;
  };
  // 院墙内的古银杏：夹着中轴两排，避开塔与探方的视线
  for (let z = 62; z < ARCH.gate - 6; z += 11) {
    for (const s of [-1, 1]) put(gin, s * rr(19, 26), GROUND_Y, z + rr(-2, 2), rr(0.85, 1.1), 6);
  }
  put(gin, -30, GROUND_Y, -8, 1.05, 7);
  put(gin, 34, GROUND_Y, -14, 0.95, 7);
  // 池畔只留西北一株：池的东南是机位与视线，树进去就把塔脚挡了
  put(wil, POOL.x0 - 4.5, GROUND_Y, POOL.z1 + 3.5, 0.95);
  put(wil, POOL.x0 - 3.0, GROUND_Y, POOL.z0 - 4.0, 0.88);
  for (let x = -120; x <= 120; x += 15) {
    if (rand() > 0.35) put(wil, x + rr(-4, 4), GROUND_Y, northBankY(), rr(0.75, 1.1));
    if (rand() > 0.45) put(wil, x + rr(-4, 4), GROUND_Y, southBank + rr(4.5, 7.5), rr(0.75, 1.1));
  }
  // 窑场边的几株（窑在岗上，树只在外围）
  for (let i = 0; i < 4; i++) put(wil, ARCH.kiln.x1 + rr(4, 12), GROUND_Y, ARCH.kiln.z0 + rr(0, ARCH.kiln.z1 - ARCH.kiln.z0), rr(0.8, 1.0));
  return grp;
}
/** 北岸岸顶的落点：柳树的几何原点在地面，y 只能是地坪高 */
function northBankY() { return RIVER.at - RIVER.halfWidth - rr(3.2, 6.0); }

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  const moonObj = moon();
  const g = ground();
  scene.add(sky.mesh, star.mesh, moonObj.mesh, horizonHaze(), g.grp, trees());

  const hemi = new THREE.HemisphereLight(0x5a78ad, 0x141822, 0.68);
  const moonLight = new THREE.DirectionalLight(0xbcd4ff, 1.35);
  moonLight.position.copy(MOON_DIR).multiplyScalar(180);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -60; sc.near = 30; sc.far = 420;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  scene.add(hemi, moonLight);

  scene.fog = new THREE.FogExp2(0x0a1024, 0.0038);

  // 西北侧冷补光：让塔身背光的檐下有余部可看
  const wash = new THREE.PointLight(0xcfe0ff, 95, 70, 2);
  wash.position.set(-22, 30, -30);
  scene.add(wash);
  // 东南侧暖光：自南面看塔时琉璃釉得有体积，不能只是一片剪影
  const towerFill = new THREE.PointLight(0xffb06a, 900, 90, 2);
  towerFill.position.set(16, 14, 26);
  scene.add(towerFill);

  return {
    ground: g.grp,
    setMoon(v) {
      moonLight.intensity = 1.35 * v;
      hemi.intensity = 0.68 * v;
      star.uni.uBright.value = 1 - 0.45 * Math.min(1, v);
      moonObj.halo.material.opacity = 0.5 + 0.35 * v;
      wash.intensity = 95 * (0.45 + 0.55 * v);
      towerFill.intensity = 760 * (0.6 + 0.4 * (2 - Math.min(2, v)));
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}

export { ARCH };
