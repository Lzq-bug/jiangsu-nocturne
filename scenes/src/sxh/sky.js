import * as THREE from 'three';
import { glow, rand, rr, lit } from '../kit.js';
import { stars } from '../environment.js';
import * as T from '../textures.js';
import { LAKE } from './data.js';

/** 月偏西北、高度适中：桥上北望能同时收进白塔与月，水面留一条月华 */
export const MOON_DIR = new THREE.Vector3(-0.33, 0.40, -0.85).normalize();

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
        vec3 zenith = vec3(0.0048,0.0075,0.020);
        vec3 mid    = vec3(0.012,0.018,0.042);
        vec3 horizon= vec3(0.028,0.026,0.034);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.82,up));
        col = mix(col, horizon, smoothstep(0.52,0.33,up));
        float sky = smoothstep(-0.03, 0.08, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.5,0.0,1.0), 2.3) * sky;
        // 城郭在东南，暖雾朝那一侧积；西北是蜀冈，只留一点冷青
        float city = smoothstep(-0.35, 0.85, d.x*0.62 + d.z*0.78);
        col += vec3(0.030,0.014,0.006) * haze * (0.30 + 0.95*city);
        col += vec3(0.006,0.012,0.018) * haze * (1.0-city) * 0.7;
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.052,0.066,0.10) * pow(md, 24.0) * 1.15 * sky;
        col += vec3(0.030,0.038,0.062) * pow(md, 6.0) * 0.35 * sky;
        float c = n(d.xz*6.5 + vec2(uTime*0.005, 0.0)) * 0.6 + n(d.xz*15.0 - vec2(uTime*0.009,0.0))*0.4;
        col = mix(col, col + vec3(0.010,0.013,0.024), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0032,0.0042,0.0085), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), mat);
  m.frustumCulled = false;
  return { mesh: m, uni };
}

function moonGroup() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(10.5, 26, 18), glow('#fff2cf', 2.4));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,238,200', 0.09), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(112, 112, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(455);
  grp.position.y = Math.max(130, grp.position.y);
  return grp;
}

/** 北面的蜀冈—观音山：只是一道起伏剪影，不加细节 */
function hills() {
  const pts = [], col = [], idx = [];
  const seg = 150;
  const cLow = new THREE.Color('#05070f'), cHigh = new THREE.Color('#0e1626');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const north = Math.max(0, -Math.cos(a));
    const x = Math.cos(a), z = Math.sin(a);
    const bump = Math.abs(Math.sin(a * 2.4 + 0.9)) * 22 + Math.abs(Math.sin(a * 5.7)) * 9 + Math.sin(a * 8.3) * 3.5;
    const R = 500;
    const hgt = 14 + bump * (0.25 + 1.35 * north * north);
    pts.push(x * R, -8, z * R * 0.92, x * R, hgt, z * R * 0.92);
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

/** 绿杨城郭：外围一圈屋脊与城楼剪影，窗眼用点光斑 */
function cityRing() {
  const grp = new THREE.Group();
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x0a0e1a, fog: true });
  silhouette.toneMapped = false;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(1, 0.6, 4, 1);
  const n = 520;
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const d = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    // 城在东南更密更近，西北只留疏落村舍
    const cityBias = Math.max(0, Math.cos(a) * 0.55 + Math.sin(a) * 0.84);
    const band = 124 + Math.pow(rand(), 0.6) * (152 - 62 * cityBias);
    const x = Math.cos(a) * band, z = Math.sin(a) * band;
    const hgt = 4.5 + rand() * (7 + 12 * cityBias);
    const w = 6 + rand() * 9;
    d.position.set(x, hgt * 0.5, z);
    d.rotation.set(0, rand() * Math.PI, 0);
    d.scale.set(w, hgt, w * 0.74);
    d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    d.position.set(x, hgt + 1.2, z);
    d.scale.set(w * 0.8, 3.2 + rand() * 2.2, w * 0.62);
    d.updateMatrix();
    roofs.setMatrixAt(i, d.matrix);
    if (rand() > 0.5) win.push(x + rr(-w * 0.3, w * 0.3), hgt * 0.55, z + rr(-2, 2));
  }
  bodies.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;

  // 城墙：一圈贴地的低墙，转角上一座角楼
  const wall = new THREE.Group();
  const wallMat = lit('#2b3145', { rough: 0.9, emissive: '#0a0e18', ei: 0.5 });
  for (let k = 0; k < 14; k++) {
    const a0 = (k / 14) * Math.PI * 2, a1 = ((k + 1) / 14) * Math.PI * 2;
    const R = 172;
    const p0 = new THREE.Vector3(Math.cos(a0) * R, 0, Math.sin(a0) * R);
    const p1 = new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R);
    const len = p0.distanceTo(p1) + 2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 7.2, 1.6), wallMat);
    seg.position.copy(p0.clone().lerp(p1, 0.5)).setY(3.6 + 2.2);
    seg.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    wall.add(seg);
    const merlons = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 1.9), wallMat);
    merlons.position.copy(seg.position).setY(seg.position.y + 3.7);
    merlons.rotation.y = seg.rotation.y;
    wall.add(merlons);
    if (k % 3 === 0) {
      const tower = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(11, 9, 9), wallMat);
      base.position.y = 4.5;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(8.6, 4.2, 4, 1), new THREE.MeshBasicMaterial({ color: 0x0b0f1c, fog: true }));
      cap.rotation.y = Math.PI / 4;
      cap.position.y = 11;
      tower.add(base, cap);
      tower.position.copy(p0).setY(2.2);
      tower.lookAt(0, 6, 0);
      wall.add(tower);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,196,132', 0.2), size: 3.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, wall, new THREE.Points(wg, wm));
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moonGroup(), hills(), cityRing());

  const hemi = new THREE.HemisphereLight(0x47649a, 0x0c1018, 0.55);
  const moonLight = new THREE.DirectionalLight(0xaec8ff, 1.12);
  moonLight.position.copy(MOON_DIR).multiplyScalar(240);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 170; sc.bottom = -170; sc.near = 40; sc.far = 560;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.45;
  scene.add(hemi, moonLight);

  // 灯把月照不到的背面捞回来：桥、塔、堤、台、南北两口
  const fills = [
    [[0, 9, 0], 0xffc07a, 340, 120],
    [[-14, 5, 4], 0xffb066, 150, 78],
    [[LAKE.tower.x, 12, LAKE.tower.z], 0xffe0b4, 160, 96],
    [[LAKE.causeway.x, 7, 110], 0xffa657, 240, 130],
    [[LAKE.causeway.x, 7, 175], 0xffbb77, 180, 110],
    [[LAKE.xichun.x, 10, LAKE.xichun.z], 0xff9a5e, 200, 96],
    [[LAKE.fishing.x - 5, 8.5, LAKE.fishing.z + 9], 0xffc98a, 120, 80],
    [[LAKE.bridge24.x, 8, LAKE.bridge24.z], 0xffbe72, 180, 100],
    [[LAKE.rainbowBridge.x, 6, LAKE.rainbowBridge.z], 0xffa657, 170, 96],
    [[36, 8, 30], 0xff9a5e, 130, 96],
  ];
  const lights = fills.map(([p, color, inten, dist]) => {
    const l = new THREE.PointLight(color, inten, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x0a1122, 0.0031);

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
