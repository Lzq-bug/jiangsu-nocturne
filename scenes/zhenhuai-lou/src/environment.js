import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr } from './kit.js';
import { STATIONS, CANAL } from './data.js';
import * as T from './textures.js';

/**
 * 月已过楼脊：方向给 (+X, 低, −Z)，也就是从城北斜斜地照过来。
 * 这样城南桥上望楼，楼是背光的剪影，只有脊线与瓦面接住一道冷边。
 */
export const MOON_DIR = new THREE.Vector3(0.72, 0.23, -0.44).normalize();
const HW = CANAL.halfWidth;
const Q = CANAL.deckY;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** 天顶冷黑，地平一线留给城南的火气 */
function skyDome() {
  const uni = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() }, uMist: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon; uniform float uMist;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0042,0.0064,0.0168);
        vec3 mid    = vec3(0.011,0.016,0.035);
        vec3 horizon= vec3(0.027,0.028,0.035);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        // 街市在城南(−x)，火气堆在那一侧；城北是署与空街，只留一点冷光
        float warm = smoothstep(0.1, -0.95, d.x);
        col += vec3(0.031,0.017,0.008) * haze * (0.3 + 1.05*warm);
        col += vec3(0.008,0.014,0.020) * haze * (1.0-warm) * 0.85;
        // 平原的夜气压得很低，地平上方一整条都是糊的
        float md = max(0.0, dot(d, normalize(uMoon)));
        col += vec3(0.070,0.076,0.092) * pow(md, 14.0) * 0.55 * sky;
        col += vec3(0.052,0.060,0.084) * pow(md, 46.0) * 1.1 * sky;
        col = mix(col, col*0.94 + vec3(0.006,0.010,0.014), uMist*0.55);
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.009,0.012,0.020), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0030,0.0044,0.0088), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function stars() {
  const N = 1200, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.10 + Math.pow(rand(), 0.75) * 0.88;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 520, y * 520, Math.sin(a) * r * 520], i * 3);
    size[i] = (0.6 + Math.pow(rand(), 3) * 3.2) * (0.45 + y * 0.8);
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
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.82,0.88,1.0), t.a*vA*0.85); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

/** 低月：压成一线城头之上，光晕比高月更大更散 */
function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(8.5, 24, 16), glow('#f7eddc', 1.4));
  const veil = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('236,236,246', 0.06), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  veil.scale.set(150, 150, 1);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('250,244,228', 0.12), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(62, 62, 1);
  grp.add(veil, halo, disc);
  grp.position.copy(MOON_DIR).multiplyScalar(430);
  return grp;
}

const boxG = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

/**
 * 四外的屋脊带。淮安在黄淮平原上，天际线只有屋与墙，没有山，
 * 所以远处只铺一层低矮体量，密度压向城南街市那一侧。
 */
function skyline() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.6, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 400;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x070a12, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const ax = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    let a = rand() * Math.PI * 2;
    // 城南（−x）密集，城北署一带空一些
    if (Math.cos(a) > 0.3 && rand() > 0.4) a = rand() * Math.PI - Math.PI / 2;
    const band = 96 + Math.pow(rand(), 0.6) * 150;
    const x = Math.cos(a) * band, z = Math.sin(a) * band * 0.9;
    const h = 4.0 + rand() * 9.5, w = 6 + rand() * 9;
    ax.position.set(x, h * 0.5, z);
    ax.rotation.set(0, rand() * Math.PI, 0);
    ax.scale.set(w, h, w * 0.72);
    ax.updateMatrix();
    bodies.setMatrixAt(i, ax.matrix);
    ax.position.set(x, h + 1.1, z);
    ax.scale.set(w * 0.78, 2.8 + rand() * 1.8, w * 0.6);
    ax.updateMatrix();
    roofs.setMatrixAt(i, ax.matrix);
    if (rand() > 0.62) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.55, z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,200,140', 0.2), size: 3.0, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));

  // 西面一角城楼：古城墙今日不存，此处写意补作天际线的方向凭据
  const gw = [];
  const gx = -HW - 92, gz = 26;
  gw.push(boxG(11, 7.0, 9, gx, 3.5, gz));
  gw.push(boxG(13, 0.6, 11, gx, 7.3, gz));
  for (let k = -2; k <= 2; k++) gw.push(boxG(1.2, 1.0, 1.0, gx + k * 2.4, 8.1, gz));
  const hut = new THREE.Mesh(mergeGeometries(gw), silhouette);
  grp.add(hut);
  return grp;
}

/* ------------------------------------------------------------------ 岸柳 */
function willowFrameGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.46, 3.6, 7);
  trunk.translate(0, 1.8, 0);
  parts.push(trunk);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rr(-0.3, 0.3);
    const br = new THREE.CylinderGeometry(0.05, 0.14, 2.3, 5);
    br.translate(0, 1.15, 0);
    br.rotateZ(0.72 + rand() * 0.3);
    br.rotateY(a);
    br.translate(0, 3.1 + rand() * 0.6, 0);
    parts.push(br);
  }
  return mergeGeometries(parts);
}
/** 一簇下垂的柳条：七八片竖着的插片绕一圈，从树冠垂下来 */
function willowClusterGeo(variant) {
  const parts = [];
  const n = 7 + variant;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(1.5 + rand() * 0.7, 3.0 + rand() * 1.2);
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const r = 0.7 + rand() * 0.9;
    g.rotateY(a);
    g.translate(Math.cos(a) * r, 4.4 + rand() * 0.9, Math.sin(a) * r);
    parts.push(g);
  }
  // 冠顶再盖两片横的，远看才不像一把伞骨
  for (let i = 0; i < 2; i++) {
    const g = new THREE.PlaneGeometry(2.2, 2.0);
    g.rotateX(-Math.PI / 2);
    g.rotateY(rand() * Math.PI);
    g.translate(rr(-0.5, 0.5), 5.4 + rand() * 0.5, rr(-0.5, 0.5));
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 冠顶的暗团：柳条是插片，没有这团墨绿兜底，远看就是一把枯枝 */
function willowCrownGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(0.95 + rand() * 0.45, 0);
    g.scale(1.3, 0.66, 1.2);
    const a = (i / 4) * Math.PI * 2 + rand();
    g.translate(Math.cos(a) * 0.75, 4.5 + rand() * 0.7, Math.sin(a) * 0.75);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 渠岸与街角的柳树；近景用实例矩阵藏树，不挡镜头 */
function willows(scene) {
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 7.5);
  const spots = [];
  // 南岸河埠与桥堍最密，是"渠柳"该在的地方
  for (let z = -58; z <= 58; z += 8) {
    if (rand() > 0.22) spots.push([-HW - rr(1.4, 4.4), z + rr(-3.2, 3.2)]);
  }
  for (let z = -56; z <= 56; z += 13) {
    if (rand() > 0.5) spots.push([HW + rr(1.6, 4.6), z + rr(-4, 4)]);
  }
  for (let i = 0; i < 8; i++) spots.push([rr(-34, 46), rr(-64, 64)]);
  const list = spots.filter(clear);

  const clusters = [M.willowA, M.willowB, M.willowC].map((m, k) =>
    new THREE.InstancedMesh(willowClusterGeo(k), m, list.length));
  const crown = new THREE.InstancedMesh(willowCrownGeo(), M.willowMass, list.length);
  const frame = new THREE.InstancedMesh(willowFrameGeo(), M.bark, list.length);
  frame.castShadow = true;
  const meshes = [frame, crown, ...clusters];

  const d = new THREE.Object3D();
  const roosts = [];
  const base = meshes.map(() => []);
  const items = [];
  list.forEach(([x, z], i) => {
    const s = rr(0.8, 1.5);
    d.position.set(x, Q - 1.4, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.92, 1.16), s);
    d.updateMatrix();
    base[0][i] = d.matrix.clone();
    const keep = rand() > 0.18;
    d.position.set(x + rr(-0.3, 0.3), Q - 1.4 + s * 0.1, z + rr(-0.3, 0.3));
    d.scale.set(s * rr(0.92, 1.15), s * rr(0.86, 1.1), s * rr(0.92, 1.15));
    d.updateMatrix();
    base[1][i] = keep ? d.matrix.clone() : ZERO.clone();
    clusters.forEach((c, k) => {
      if (!keep && k !== i % 3) { base[k + 2][i] = ZERO.clone(); return; }
      d.position.set(x + rr(-0.4, 0.4), Q - 1.4 + s * 0.1, z + rr(-0.4, 0.4));
      d.scale.set(s * rr(0.9, 1.2), s * rr(0.86, 1.12), s * rr(0.9, 1.2));
      d.updateMatrix();
      base[k + 2][i] = d.matrix.clone();
    });
    roosts.push(new THREE.Vector3(x, Q - 1.4 + s * 5.6, z));
    items.push({ x, z, hidden: false });
  });
  meshes.forEach((m, k) => {
    base[k].forEach((mx, i) => m.setMatrixAt(i, mx || ZERO));
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  });

  return {
    roosts,
    /** 走进去时把身边的树缩掉，站姿才不会被一丛柳条糊住 */
    declutter(camPos) {
      let changed = false;
      items.forEach((it, i) => {
        const near = camPos.y < Q + 9 && Math.hypot(it.x - camPos.x, it.z - camPos.z) < 4.6;
        if (near === it.hidden) return;
        it.hidden = near;
        changed = true;
        meshes.forEach((m, k) => m.setMatrixAt(i, near ? ZERO : base[k][i]));
      });
      if (changed) meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    },
  };
}

/* ------------------------------------------------------------------ 栖鸦 */
const CROW_COUNT = 16;
function crows(scene, roosts) {
  const bodyGeo = new THREE.SphereGeometry(0.13, 7, 5);
  bodyGeo.scale(1, 0.8, 2.0);
  const wingGeo = new THREE.PlaneGeometry(0.44, 0.2);
  wingGeo.translate(0.24, 0, 0);
  const ink = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.95, side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(bodyGeo, ink, CROW_COUNT);
  const wingsL = new THREE.InstancedMesh(wingGeo, ink, CROW_COUNT);
  const wingsR = new THREE.InstancedMesh(wingGeo, ink, CROW_COUNT);
  const parts = [bodies, wingsL, wingsR];
  parts.forEach((m) => { m.frustumCulled = false; scene.add(m); });

  // 翅膀挂在虚拟骨架上，实例矩阵只取合成结果
  const root = new THREE.Object3D();
  const bNode = new THREE.Object3D();
  const lNode = new THREE.Object3D();
  const rNode = new THREE.Object3D();
  lNode.position.set(-0.02, 0.04, 0);
  rNode.position.set(0.02, 0.04, 0);
  rNode.rotation.y = Math.PI;
  root.add(bNode, lNode, rNode);

  const birds = [];
  for (let i = 0; i < CROW_COUNT; i++) {
    const perch = i < CROW_COUNT - 4 && roosts.length;
    const home = perch ? roosts[(rand() * roosts.length) | 0].clone()
      : new THREE.Vector3(rr(-44, 44), rr(14, 24), rr(-60, 60));
    birds.push({
      home, pos: home.clone(), vel: new THREE.Vector3(),
      flap: rand() * 6.28, phase: rand() * 6.28,
      state: perch ? 'roost' : 'circle',
      circleR: rr(16, 40), circleA: rand() * 6.28, until: 0,
    });
  }
  const tmp = new THREE.Vector3();
  const pose = (p, yaw, f, idle) => {
    root.position.copy(p);
    root.rotation.set(0, yaw, 0);
    bNode.rotation.set(0, 0, 0);
    lNode.rotation.set(0, 0, idle ? 0.06 * f : 0.45 * f + 0.1);
    rNode.rotation.set(0, 0, idle ? -0.06 * f : -0.45 * f - 0.1);
    root.updateMatrixWorld(true);
  };
  return {
    /** 鼓一响，栖鸦惊起：以撞点为心向外散 */
    startle(x, z, t) {
      let n = 0;
      for (const b of birds) {
        if (b.state !== 'roost') continue;
        const d = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d > 78) continue;
        b.state = 'fly';
        b.until = t + rr(5.5, 9.0);
        b.vel.set((b.pos.x - x) / (d || 1), rr(0.45, 0.85), (b.pos.z - z) / (d || 1))
          .multiplyScalar(rr(9, 15));
        n++;
      }
      return n;
    },
    update(t, dt) {
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        if (b.state === 'roost') {
          b.pos.copy(b.home);
          b.pos.y += Math.sin(t * 1.4 + b.phase) * 0.03;
          pose(b.pos, b.phase, Math.sin(t * 1.1 + b.phase), true);
        } else if (b.state === 'fly') {
          b.vel.y -= dt * 1.4;
          b.vel.multiplyScalar(1 - dt * 0.22);
          b.pos.addScaledVector(b.vel, dt);
          if (b.pos.y > 28) b.vel.y = Math.min(b.vel.y, 0.4);
          if (b.pos.y < 9) { b.pos.y = 9; b.vel.y = Math.abs(b.vel.y) * 0.6 + 1.2; }
          b.flap += dt * 13;
          if (t > b.until) b.state = 'return';
          pose(b.pos, Math.atan2(b.vel.x, b.vel.z), Math.sin(b.flap), false);
        } else if (b.state === 'return') {
          tmp.subVectors(b.home, b.pos);
          const need = tmp.length();
          if (need < 1.2) { b.state = b.home.y < 22 ? 'roost' : 'circle'; b.vel.set(0, 0, 0); }
          tmp.multiplyScalar(1 / (need || 1));
          b.pos.addScaledVector(tmp, dt * Math.min(14, need * 2.2));
          b.pos.y += Math.sin(t * 3 + b.phase) * dt * 2.2;
          b.flap += dt * 9;
          pose(b.pos, Math.atan2(tmp.x, tmp.z), Math.sin(b.flap), false);
        } else {
          b.circleA += dt * 0.16;
          b.pos.set(
            b.home.x + Math.cos(b.circleA) * b.circleR,
            b.home.y + Math.sin(t * 0.5 + b.phase) * 2.2,
            b.home.z + Math.sin(b.circleA) * b.circleR * 1.2,
          );
          b.flap += dt * 6.5;
          pose(b.pos, b.circleA + Math.PI / 2, Math.sin(b.flap), false);
        }
        bodies.setMatrixAt(i, bNode.matrixWorld);
        wingsL.setMatrixAt(i, lNode.matrixWorld);
        wingsR.setMatrixAt(i, rNode.matrixWorld);
      }
      parts.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    },
    set on(v) { parts.forEach((m) => { m.visible = v; }); },
  };
}

/* ------------------------------------------------------------------ 夜气 */
function riverMist(scene) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: T.mistStreaks(), transparent: true, opacity: 0.45, color: 0xbcd6e6,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const bands = [];
  // 夜气只贴着渠面一层：低机位看得见，上了台顶它已经化进水里
  for (let i = 0; i < 9; i++) {
    const w = 54 + rand() * 64, h = 4.5 + rand() * 6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(rr(-HW, HW) * 1.3, 0.3 + rand() * 1.0, -104 + i * 26 + rr(-9, 9));
    m.renderOrder = 2;
    grp.add(m);
    bands.push({ m, sp: rr(0.4, 1.3), base: m.position.z, ph: rand() * 6.28 });
  }
  scene.add(grp);
  return {
    grp,
    update(t) {
      for (const b of bands) {
        if (!b.sp) continue;
        b.m.position.z = b.base + Math.sin(t * 0.06 + b.ph) * 12;
      }
      mat.opacity = 0.24 + 0.05 * Math.sin(t * 0.18);
    },
  };
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), skyline());

  const trees = willows(scene);
  const crowFlock = crows(scene, trees.roosts);
  const mist = riverMist(scene);

  const hemi = new THREE.HemisphereLight(0x4d74a8, 0x1a1a20, 1.3);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.75);
  moonLight.position.copy(MOON_DIR).multiplyScalar(170);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -92; sc.right = 92; sc.top = 92; sc.bottom = -92; sc.near = 20; sc.far = 360;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  // 月从楼后来，城南这一面几乎接不住光；补一盏从街市方向来的暖色天光只负责出形
  const cityBounce = new THREE.DirectionalLight(0xffc68c, 0.75);
  cityBounce.position.set(-120, 62, -30);
  scene.add(hemi, moonLight, cityBounce);

  // 暖光只来自三处：楼上的灯、桥与渠、城南街市
  const fillSpots = [
    [[18.5, 13.0, 0], 0xffc07a, 190, 78],      // 楼阁明间
    [[17.5, 10.6, 0], 0xff8f4c, 130, 52],      // 台顶鼓位
    [[19.5, 3.8, 0], 0xffc07a, 105, 34],       // 券门里
    [[0, 7.6, 0], 0xffd2a0, 120, 50],          // 桥心
    [[-14.5, 4.6, 14], 0xffa657, 170, 70],     // 南岸河房
    [[-20.5, 4.4, -12], 0xffbb77, 150, 64],    // 南门大街
    [[-20.0, 4.2, 14], 0xff9a58, 150, 64],     // 大街北段
    [[12.0, 4.6, 10], 0xffb877, 130, 56],      // 楼前街
    [[44, 4.8, 0], 0xff9a58, 130, 60],         // 署前街
  ];
  const lights = fillSpots.map(([p, color, intensity, dist]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x091322, 0.0042);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    trees,
    crows: crowFlock,
    lights,
    setStarBright(v) { star.uni.uBright.value = v; },
    setCrows(v) { crowFlock.on = v; },
    setMist(v) { mist.grp.visible = v; sky.uni.uMist.value = v ? 1 : 0; },
    startle(x, z, t) { return crowFlock.startle(x, z, t); },
    update(t, dt) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      mist.update(t);
      crowFlock.update(t, dt);
    },
  };
}
