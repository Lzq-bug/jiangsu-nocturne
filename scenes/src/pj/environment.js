import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, glow, rand, rr, registerOccluder } from '../kit.js';
import { stars, willowGeo } from '../environment.js';
import { RIVER, STATIONS, ALLEYS } from './data.js';
import * as T from '../textures.js';

/** 月亮挂在河的下游偏西一侧，银光顺河铺下来，与暖色灯河对拉 */
export const MOON_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();

/** 报恩寺塔（北寺塔）：九级八面，高约 76 米，立在屋脊之外 */
export const PAGODA = { pos: new THREE.Vector3(-46, 0, -180), levels: 9, height: 76 };

const HW = RIVER.halfWidth;

/** 清冷的夜：天顶近黑，地平线只留一线城中灯火的余温 */
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
        vec3 zenith = vec3(0.0040,0.0058,0.0155);
        vec3 mid    = vec3(0.010,0.0145,0.032);
        vec3 horizon= vec3(0.024,0.0225,0.030);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.82,up));
        col = mix(col, horizon, smoothstep(0.52,0.33,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.7,0.0,1.0), 2.4) * sky;
        // 灯火余温顺着河道那一侧浮起来
        float warm = smoothstep(-0.2, 0.95, d.z*0.86 - d.x*0.3);
        col += vec3(0.026,0.0135,0.005) * haze * (0.3 + 0.95*warm);
        float md = max(0.0, dot(d, normalize(vec3(-0.55,0.62,0.56))));
        col += vec3(0.05,0.062,0.092) * pow(md, 34.0) * 0.8 * sky;
        float c = n(d.xz*8.0 + vec2(uTime*0.005, 0.0)) * 0.6 + n(d.xz*19.0 - vec2(uTime*0.009,0.0))*0.4;
        col = mix(col, col + vec3(0.008,0.011,0.020), smoothstep(0.48,0.88,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0030,0.0038,0.0075), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(560, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), glow('#fff6de', 1.45));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,238,208', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(84, 84, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(420);
  grp.position.y = Math.max(104, grp.position.y);
  return grp;
}

/** 城里的屋脊一层压一层，只留剪影和零星窗灯 */
function roofSea() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.55, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 380;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x18213a, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const dum = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    let a = rand() * Math.PI * 2;
    let x = 0, z = 0;
    // 让开中间那条河街的取景走廊，屋脊只围在两侧
    for (let tries = 0; tries < 8; tries++) {
      const band = 78 + Math.pow(rand(), 0.6) * 150;
      x = Math.cos(a) * band;
      z = Math.sin(a) * band * 0.9;
      if (!(Math.abs(x) < 16 && Math.abs(z) < 118)) break;
      a += 0.7;
    }
    const h = 4 + rand() * 9, w = 6 + rand() * 8;
    dum.position.set(x, h * 0.5, z);
    dum.rotation.set(0, rand() * Math.PI, 0);
    dum.scale.set(w, h, w * 0.7);
    dum.updateMatrix();
    bodies.setMatrixAt(i, dum.matrix);
    dum.position.set(x, h + 1.1, z);
    dum.scale.set(w * 0.8, 2.8 + rand() * 1.6, w * 0.6);
    dum.updateMatrix();
    roofs.setMatrixAt(i, dum.matrix);
    if (rand() > 0.62) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.55, z + rr(-1.6, 1.6));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,196,138', 0.2), size: 2.6, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/** 低低的城脊，把塔衬在高处 */
function skyline() {
  const pts = [], col = [], idx = [];
  const seg = 96, R = 300;
  const cLow = new THREE.Color('#06090f'), cHigh = new THREE.Color('#121a2c');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const bump = Math.abs(Math.sin(a * 2.7 + 0.8)) * 9 + Math.abs(Math.sin(a * 6.3)) * 4.5 + Math.sin(a * 11.2) * 1.8;
    const h = 11 + bump;
    pts.push(x * R, -4, z * R, x * R, h, z * R);
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

/** 楼阁式塔：砖身逐层收分，每层挑出木檐与平座，塔头点灯 */
function pagoda() {
  const grp = new THREE.Group();
  const bodyParts = [], eaveParts = [];
  const levelH = (PAGODA.height - 12) / PAGODA.levels;
  let r = 6.4, y = 0;
  // 副阶：塔基一圈回廊
  bodyParts.push(new THREE.CylinderGeometry(r * 1.32, r * 1.4, 4.2, 8).translate(0, 2.1, 0));
  eaveParts.push(new THREE.ConeGeometry(r * 1.9, 1.9, 8, 1, true).translate(0, 4.6, 0));
  y = 4.2;
  const lampPts = [];
  for (let i = 0; i < PAGODA.levels; i++) {
    const h = levelH * (i === PAGODA.levels - 1 ? 0.86 : 1);
    bodyParts.push(new THREE.CylinderGeometry(r * 0.9, r, h, 8).translate(0, y + h / 2, 0));
    eaveParts.push(new THREE.ConeGeometry(r * 1.42, h * 0.42, 8, 1, true).translate(0, y + h, 0));
    // 平座栏杆
    bodyParts.push(new THREE.CylinderGeometry(r * 1.16, r * 1.16, h * 0.1, 8, 1, true).translate(0, y + h * 0.06, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      lampPts.push(Math.cos(a) * r * 1.3, y + h + 0.5, Math.sin(a) * r * 1.3);
    }
    y += h + h * 0.12;
    r *= 0.885;
  }
  const finial = [];
  finial.push(new THREE.CylinderGeometry(0.22, 0.5, 5.6, 6).translate(0, y + 2.8, 0));
  for (let i = 0; i < 4; i++) finial.push(new THREE.TorusGeometry(0.9 - i * 0.16, 0.13, 5, 12).rotateX(Math.PI / 2).translate(0, y + 1.4 + i * 1.1, 0));
  const cap = new THREE.SphereGeometry(0.5, 8, 6);
  cap.translate(0, y + 6.2, 0);
  finial.push(cap);

  const shell = new THREE.MeshBasicMaterial({ color: 0x2a3854, fog: false, side: THREE.DoubleSide });
  shell.toneMapped = false;
  const dark = new THREE.MeshBasicMaterial({ color: 0x1b2540, fog: false, side: THREE.DoubleSide });
  dark.toneMapped = false;
  grp.add(new THREE.Mesh(mergeGeometries(bodyParts), shell));
  grp.add(new THREE.Mesh(mergeGeometries(eaveParts), dark));
  grp.add(new THREE.Mesh(mergeGeometries(finial), glow('#ffd9a0', 1.15)));

  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(lampPts), 3));
  const lm = new THREE.PointsMaterial({
    map: T.softGlow('255,206,150', 0.18), size: 3.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(new THREE.Points(lg, lm));
  grp.position.copy(PAGODA.pos);
  return grp;
}

/** 樟树：一团长在街面上的暗叶冠 */
function camphorGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.3, 0.55, 4.2, 7);
  trunk.translate(0, 2.1, 0);
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const br = new THREE.CylinderGeometry(0.1, 0.2, 1.8, 5);
    br.translate(0, 4.3, 0);
    br.rotateZ((i - 2) * 0.5);
    br.rotateY(i * 1.9);
    parts.push(br);
  }
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2, rad = 1.1 + rand() * 1.9;
    const blob = new THREE.IcosahedronGeometry(1.5 + rand() * 1.1, 1);
    blob.scale(1.25, 0.72, 1.1);
    blob.translate(Math.cos(a) * rad, 5.3 + rand() * 1.3, Math.sin(a) * rad);
    parts.push(blob);
  }
  // IcosahedronGeometry 没有 index，与圆柱合并前必须把两边都拆成非索引，否则 mergeGeometries 返回 null
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

function trees() {
  const grp = new THREE.Group();
  const willow = willowGeo();
  const camphor = camphorGeo();
  const leafMat = lit('#22333a', { rough: 0.95, side: THREE.DoubleSide });
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 6.5)
    && ALLEYS.every((al) => Math.abs(al.z - z) > 5);
  const spots = [];
  for (let z = -92; z <= 92; z += 13) {
    if (rand() > 0.42) spots.push(['w', -(HW + 5.6 + rr(0, 2.6)), z + rr(-4, 4)]);
    if (rand() > 0.5) spots.push(['w', HW + 4.4 + rr(0, 2.2), z + rr(-4, 4)]);
    if (rand() > 0.62) spots.push(['c', -(HW + 11.5 + rr(0, 3.2)), z + rr(-5, 5)]);
  }
  for (const [kind, x, z] of spots.filter(([, x, z]) => clear([x, z]))) {
    const t = new THREE.Mesh(kind === 'w' ? willow : camphor, leafMat);
    const s = rr(0.68, 1.15);
    t.scale.set(s, s * rr(0.92, 1.12), s);
    t.position.set(x, kind === 'w' ? 1.9 : 0.3, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, 3.6));
  }
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), roofSea(), skyline(), pagoda(), trees());

  const hemi = new THREE.HemisphereLight(0x465f93, 0x0c1020, 0.8);
  const moonLight = new THREE.DirectionalLight(0xb6cdff, 1.55);
  moonLight.position.copy(MOON_DIR).multiplyScalar(150);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 20; sc.far = 300;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.35;
  scene.add(hemi, moonLight);

  // 沿街与沿河的暖色补光：把粉墙和瓦面从月色里拉回来，但别把白墙烧成一片
  const fillSpots = [
    [[-5.4, 4.4, -70], 0xffb877, 52, 30],
    [[-5.4, 4.4, -34], 0xffb06a, 52, 30],
    [[-5.4, 4.4, 2], 0xffc07a, 48, 30],
    [[-5.4, 4.4, 38], 0xffb877, 48, 30],
    [[-5.4, 4.4, 70], 0xffc07a, 44, 30],
    [[6.0, 3.0, -12], 0xffbb7d, 34, 26],
    [[6.4, 3.0, 26], 0xffbb7d, 34, 26],
    [[0, 6.2, -18], 0xffd2a0, 40, 26],
    [[14, 2.6, -2], 0xff9f5c, 38, 28],
  ];
  const fills = fillSpots.map(([p, color, i, dist]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x0a1122, 0.0036);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
