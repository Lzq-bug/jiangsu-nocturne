import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr } from './kit.js';
import { STATIONS, RIVER, DIKE, SEA } from './data.js';
import * as T from './textures.js';

/**
 * 月出海上：月亮压在东边海平线上，低到能把整条串场河照成一面冷镜子。
 * 天空、水面月光、平行光共用这个方向，改它等于改一整夜的朝向。
 */
export const MOON_DIR = new THREE.Vector3(0.9, 0.36, 0.26).normalize();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** 天顶冷黑，海那一侧留一线青白，镇那一侧留火气 */
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
        vec3 zenith = vec3(0.0035,0.0058,0.0150);
        vec3 mid    = vec3(0.009,0.014,0.032);
        vec3 horizon= vec3(0.024,0.028,0.036);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        // 东(+x)是海：一线冷青；西(-x)是镇与灶：橙火气从低处堆上来
        float sea = smoothstep(0.1, 0.95, d.x);
        float town = smoothstep(0.05, 0.95, -d.x);
        col += vec3(0.030,0.044,0.058) * haze * (0.35 + 1.1*sea);
        col += vec3(0.034,0.018,0.008) * haze * (0.25 + 0.95*town);
        // 出海之月的光晕：贴近海平时会拖出一层薄翳
        float md = max(0.0, dot(d, normalize(uMoon)));
        col += vec3(0.072,0.078,0.094) * pow(md, 14.0) * 0.6 * sky;
        col += vec3(0.054,0.062,0.086) * pow(md, 46.0) * 1.15 * sky;
        col = mix(col, col*0.95 + vec3(0.007,0.012,0.016), uMist*0.5);
        float c = n(d.xz*7.0 + vec2(uTime*0.008, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.013,0.0))*0.4;
        col = mix(col, col + vec3(0.010,0.014,0.022), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0028,0.0040,0.0080), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(1750, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function stars() {
  const N = 1150, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.12 + Math.pow(rand(), 0.75) * 0.86;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 1560, y * 1560, Math.sin(a) * r * 1560], i * 3);
    size[i] = (0.6 + Math.pow(rand(), 3) * 3.1) * (0.45 + y * 0.8);
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

/** 出海之月：一枚冷轮加两层散光 */
function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(7.4, 24, 16), glow('#f2eadb', 1.05));
  const veil = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('232,236,246', 0.06), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  veil.scale.set(104, 104, 1);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('246,242,232', 0.12), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(40, 40, 1);
  grp.add(veil, halo, disc);
  grp.position.copy(MOON_DIR).multiplyScalar(1350);
  return grp;
}

const boxG = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const meshOf = (parts, mat) => new THREE.Mesh(mergeGeometries(parts), mat);

/** 远景剪影带：西与北是镇与外乡的屋宇，东边海上留几条远帆的暗脊 */
function farBands() {
  const grp = new THREE.Group();
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x060a14, fog: true });
  silhouette.toneMapped = false;
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 340;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const bax = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    // 密度压在西、北两侧（镇与腹地），东侧留给海
    let a = rand() * Math.PI * 2;
    if (Math.cos(a) > 0.15 && rand() > 0.2) a = Math.PI * 0.55 + rand() * Math.PI * 0.9;
    const band = 150 + Math.pow(rand(), 0.6) * 230;
    const x = Math.cos(a) * band, z = Math.sin(a) * band * 0.95;
    const h = 4.5 + rand() * 10, w = 6 + rand() * 9;
    bax.position.set(x, h * 0.5 - 1, z);
    bax.rotation.set(0, rand() * Math.PI, 0);
    bax.scale.set(w, h, w * 0.72);
    bax.updateMatrix();
    bodies.setMatrixAt(i, bax.matrix);
    bax.position.set(x, h + 0.2, z);
    bax.scale.set(w * 0.78, 3.0 + rand() * 2, w * 0.6);
    bax.updateMatrix();
    roofs.setMatrixAt(i, bax.matrix);
    if (rand() > 0.55) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.55, z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,196,136', 0.2), size: 3.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));

  // 海上的远帆：暗脊 + 一盏桅灯，给"堤外就是海"一个凭据
  const sails = [], lampPos = [];
  for (let i = 0; i < 7; i++) {
    const x = 380 + rand() * 520;
    const z = -160 + rand() * 320;
    const h = 7 + rand() * 9;
    sails.push(boxG(2.2, h, 1.6, x, h * 0.5 - 1.2, z));
    sails.push(boxG(1.1, h * 1.5, 0.3, x + 1.4, h * 0.7, z));
    lampPos.push(x + rand() * 2 - 1, h * 0.9 - 1, z);
  }
  grp.add(meshOf(sails, silhouette));
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lampPos), 3));
  const lm = new THREE.PointsMaterial({
    map: T.softGlow('255,178,110', 0.22), size: 9, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(new THREE.Points(lg, lm));
  return grp;
}

/** 堤的余脉：从画面两端一直拉进雾里，才读得出"长堤" */
function dikeExtension() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a1118, fog: true });
  mat.toneMapped = false;
  for (const sign of [-1, 1]) {
    const parts = [];
    let z = sign * 96;
    for (let i = 0; i < 9; i++) {
      const len = 58 + rand() * 22;
      const cz = z + sign * len * 0.5;
      const y = Math.max(1.5, DIKE.crestY * (0.92 - i * 0.05));
      const w = (DIKE.xCrestE - DIKE.xCrestW) + i * 3.4;
      const cx = (DIKE.xCrestE + DIKE.xCrestW) / 2 - i * 1.4;
      parts.push(boxG(w, y + 4, len, cx, (y + 4) * 0.5 - 4, cz));
      z += sign * len;
    }
    grp.add(meshOf(parts, mat));
  }
  return grp;
}

/* ------------------------------------------------------------------ 堤柳 */
function willowFrameGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.19, 0.46, 3.6, 7);
  trunk.translate(0, 1.8, 0);
  parts.push(trunk);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rr(-0.35, 0.35);
    const br = new THREE.CylinderGeometry(0.06, 0.15, 2.0, 5);
    br.translate(0, 1.0, 0);
    br.rotateZ(0.72 + rand() * 0.3);
    br.rotateY(a);
    br.translate(0, 3.1 + rand() * 0.6, 0);
    parts.push(br);
  }
  return mergeGeometries(parts);
}

function willowCanopyGeo(variant) {
  const parts = [];
  const n = 4 + variant;
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(0.9 + rand() * 0.5, 0);
    g.scale(1.2, 0.7, 1.1);
    const a = (i / n) * Math.PI * 2 + rand();
    const r = 0.8 + rand() * 1.3;
    g.translate(Math.cos(a) * r, 4.5 + rand() * 1.4, Math.sin(a) * r);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 下垂的柳条：一条细长双面片，从梢部原点往下挂 */
function willowStrandGeo() {
  const g = new THREE.PlaneGeometry(0.11, 2.1, 1, 3);
  g.translate(0, -1.05, 0);
  return g;
}

/**
 * 堤柳与岸柳。三处成行：堤顶内坡一线、串场河纤道一线、镇后零星。
 * 机位视线上的树用实例矩阵缩掉，免得糊住镜头。
 */
function willowRows(scene) {
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 7.5);
  const spots = [];
  // 堤顶行柳：长堤最好认的记号
  for (let z = -150; z <= 150; z += 14) {
    if (rand() > 0.16) spots.push([(DIKE.xCrestE + DIKE.xCrestW) / 2 + rr(-2.6, 2.6), z + rr(-2.8, 2.8), DIKE.crestY]);
  }
  // 西岸纤道
  for (let z = -70; z <= 110; z += 15) {
    if (rand() > 0.35) spots.push([-RIVER.halfWidth - rr(1.6, 3.6), z + rr(-3.5, 3.5), RIVER.deckY]);
  }
  // 镇后与北岸零星
  for (let i = 0; i < 14; i++) spots.push([rr(-RIVER.halfWidth - 34, RIVER.halfWidth + 42), rr(-96, 150), 0.2]);
  const list = spots.filter(([x, z]) => clear([x, z]));

  const frame = new THREE.InstancedMesh(willowFrameGeo(), M.woodDark, list.length);
  frame.castShadow = true;
  const canopies = [M.leaf, M.leaf].map((m, k) =>
    new THREE.InstancedMesh(willowCanopyGeo(k), m, list.length));
  const strands = new THREE.InstancedMesh(willowStrandGeo(), M.leaf, list.length * 9);
  strands.material = M.leaf;
  const meshes = [frame, ...canopies];
  const d = new THREE.Object3D();
  const base = meshes.map(() => []);
  const strandBase = [];
  const items = [];
  const roosts = [];

  list.forEach(([x, z, ground], i) => {
    const s = rr(0.82, 1.5);
    d.position.set(x, ground + 1.9, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.92, 1.18), s);
    d.updateMatrix();
    base[0][i] = d.matrix.clone();
    canopies.forEach((c, k) => {
      d.position.set(x + rr(-0.4, 0.4), ground + 1.9 + s * 0.1, z + rr(-0.4, 0.4));
      d.scale.set(s * rr(0.9, 1.2), s * rr(0.85, 1.1), s * rr(0.9, 1.2));
      d.updateMatrix();
      base[k + 1][i] = d.matrix.clone();
    });
    for (let j = 0; j < 9; j++) {
      const a = (j / 9) * 6.28 + rand();
      const r = (0.9 + rand() * 1.5) * s;
      d.position.set(x + Math.cos(a) * r, ground + 5.2 * s + rand() * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, rr(-0.12, 0.12));
      d.scale.set(s * rr(0.8, 1.2), s * rr(0.7, 1.15), s);
      d.updateMatrix();
      strandBase.push(d.matrix.clone());
    }
    roosts.push(new THREE.Vector3(x, ground + 5.9 * s, z));
    items.push({ x, z, hidden: false });
  });
  const strandMesh = strands;
  strandMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  meshes.forEach((m, k) => {
    base[k].forEach((mx, i) => m.setMatrixAt(i, mx || ZERO));
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  });
  strandBase.forEach((mx, i) => strandMesh.setMatrixAt(i, mx));
  strandMesh.instanceMatrix.needsUpdate = true;
  strandMesh.frustumCulled = false;
  scene.add(strandMesh);

  const all = [...meshes, strandMesh];
  return {
    roosts,
    /** 走进去时把身边的树缩掉，站姿才不会被一坨柳条糊住 */
    declutter(camPos) {
      let changed = false;
      items.forEach((it, i) => {
        const near = camPos.y < 13 && Math.hypot(it.x - camPos.x, it.z - camPos.z) < 4.6;
        if (near === it.hidden) return;
        it.hidden = near;
        changed = true;
        meshes.forEach((m, k) => m.setMatrixAt(i, near ? ZERO : base[k][i]));
        for (let j = 0; j < 9; j++) strandMesh.setMatrixAt(i * 9 + j, near ? ZERO : strandBase[i * 9 + j]);
      });
      if (changed) {
        meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
        strandMesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/* ------------------------------------------------------------------ 沙鸥 */
const GULL_COUNT = 14;
function gullFlock(scene, roosts) {
  const bodyGeo = new THREE.SphereGeometry(0.15, 7, 5);
  bodyGeo.scale(1, 0.8, 2.1);
  const wingGeo = new THREE.PlaneGeometry(0.62, 0.2);
  wingGeo.translate(0.33, 0, 0);
  const ink = new THREE.MeshStandardMaterial({ color: 0x161c26, roughness: 0.92, side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(bodyGeo, ink, GULL_COUNT);
  const wingsL = new THREE.InstancedMesh(wingGeo, ink, GULL_COUNT);
  const wingsR = new THREE.InstancedMesh(wingGeo, ink, GULL_COUNT);
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
  for (let i = 0; i < GULL_COUNT; i++) {
    const perch = i < GULL_COUNT - 5 && roosts.length;
    const home = perch
      ? roosts[(rand() * roosts.length) | 0].clone()
      : new THREE.Vector3(rr(130, 330), rr(14, 26), rr(-140, 160));
    birds.push({
      home, pos: home.clone(), vel: new THREE.Vector3(),
      flap: rand() * 6.28, phase: rand() * 6.28,
      state: perch ? 'roost' : 'circle',
      circleR: rr(20, 54), circleA: rand() * 6.28, until: 0,
    });
  }
  const tmp = new THREE.Vector3();
  const pose = (p, yaw, f, idle) => {
    root.position.copy(p);
    root.rotation.set(0, yaw, 0);
    bNode.rotation.set(0, 0, 0);
    lNode.rotation.set(0, 0, idle ? 0.05 * f : 0.42 * f + 0.1);
    rNode.rotation.set(0, 0, idle ? -0.05 * f : -0.42 * f - 0.1);
    root.updateMatrixWorld(true);
  };
  return {
    /** 潮头一拍堤，栖鸥四散 */
    startle(x, z, t) {
      let n = 0;
      for (const b of birds) {
        if (b.state !== 'roost') continue;
        const d = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d > 110) continue;
        b.state = 'fly';
        b.until = t + rr(6, 10);
        b.vel.set((b.pos.x - x) / (d || 1), rr(0.5, 0.9), (b.pos.z - z) / (d || 1))
          .multiplyScalar(rr(10, 17));
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
          b.vel.y -= dt * 1.3;
          b.vel.multiplyScalar(1 - dt * 0.2);
          b.pos.addScaledVector(b.vel, dt);
          if (b.pos.y > 30) b.vel.y = Math.min(b.vel.y, 0.4);
          if (b.pos.y < 9) { b.pos.y = 9; b.vel.y = Math.abs(b.vel.y) * 0.6 + 1.2; }
          b.flap += dt * 12;
          if (t > b.until) b.state = 'return';
          pose(b.pos, Math.atan2(b.vel.x, b.vel.z), Math.sin(b.flap), false);
        } else if (b.state === 'return') {
          tmp.subVectors(b.home, b.pos);
          const need = tmp.length();
          if (need < 1.2) { b.state = b.home.y < 20 ? 'roost' : 'circle'; b.vel.set(0, 0, 0); }
          tmp.multiplyScalar(1 / (need || 1));
          b.pos.addScaledVector(tmp, dt * Math.min(15, need * 2.2));
          b.pos.y += Math.sin(t * 3 + b.phase) * dt * 2.2;
          b.flap += dt * 8;
          pose(b.pos, Math.atan2(tmp.x, tmp.z), Math.sin(b.flap), false);
        } else {
          b.circleA += dt * 0.15;
          b.pos.set(
            b.home.x + Math.cos(b.circleA) * b.circleR,
            b.home.y + Math.sin(t * 0.5 + b.phase) * 2.4,
            b.home.z + Math.sin(b.circleA) * b.circleR * 1.2,
          );
          b.flap += dt * 5.5;
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

/* ------------------------------------------------------------------ 海气 */
function seaMist(scene) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: T.mistStreaks(), transparent: true, opacity: 0.1, color: 0x8aa8bd,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const bands = [];
  // 河上一道、堤脚一道、海上一道：低机位看得见，抬高机位时它已经化进水里
  for (let i = 0; i < 5; i++) {
    const w = 66 + rand() * 90, h = 5 + rand() * 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(rr(-RIVER.halfWidth, RIVER.halfWidth) * 1.5, 0.3 + rand() * 1.1, -150 + i * 40 + rr(-12, 12));
    m.renderOrder = 2;
    grp.add(m);
    bands.push({ m, sp: rr(0.4, 1.3), base: m.position.z, ph: rand() * 6.28, axis: 'z' });
  }
  for (let i = 0; i < 3; i++) {
    const w = 120 + rand() * 160, h = 8 + rand() * 10;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 2;
    m.position.set(SEA.x0 + 24 + i * 92 + rand() * 30, 0.6 + rand() * 2.2, rr(-140, 170));
    m.renderOrder = 2;
    grp.add(m);
    bands.push({ m, sp: rr(0.25, 0.8), base: m.position.x, ph: rand() * 6.28, axis: 'x' });
  }
  scene.add(grp);
  return {
    grp,
    update(t) {
      for (const b of bands) {
        if (!b.sp) continue;
        if (b.axis === 'z') b.m.position.z = b.base + Math.sin(t * 0.05 + b.ph) * 18;
        else b.m.position.x = b.base - ((t * b.sp * 3.2) % 260);
      }
      mat.opacity = 0.055 + 0.022 * Math.sin(t * 0.18);
    },
  };
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), farBands(), dikeExtension());

  const hemi = new THREE.HemisphereLight(0x40608a, 0x0a0e14, 0.46);
  const ambient = new THREE.AmbientLight(0x1a2438, 0.34);
  const moonLight = new THREE.DirectionalLight(0x9fbfff, 1.25);
  moonLight.position.copy(MOON_DIR).multiplyScalar(210);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 130; sc.bottom = -130; sc.near = 40; sc.far = 460;
  moonLight.shadow.bias = -0.0014;
  moonLight.shadow.normalBias = 0.5;
  // 月光把东边堤与海照得很清，镇那一侧要补一盏暖色天光才看得出形体
  const townBounce = new THREE.DirectionalLight(0xffc08a, 0.26);
  townBounce.position.set(-150, 60, 40);
  const emberBounce = new THREE.DirectionalLight(0xff8f4a, 0.22);
  emberBounce.position.set(70, 18, -40);
  // 河面一侧的暖反射：把临河的墙从冷蓝色里拉回来
  const riverBounce = new THREE.DirectionalLight(0xffb877, 0.3);
  riverBounce.position.set(120, 26, -60);
  scene.add(hemi, ambient, moonLight, townBounce, emberBounce, riverBounce);

  // 暖光的四个来处：东岸灶火、河上坝灯、镇街灯火、堤顶巡堤灯
  const fillSpots = [
    [[38, 4.2, -34], 0xff8a3c, 240, 92],
    [[44, 3.4, -12], 0xffa657, 150, 74],
    [[26, 3.0, 2], 0xffcf95, 120, 66],
    [[2, 3.2, 12], 0xffd2a0, 110, 62],
    [[-103, 8.6, 40], 0xffc07a, 180, 86],
    [[-103, 8.6, -30], 0xffd2a0, 120, 78],
    [[-28, 4.0, 30], 0xffb066, 230, 84],
    [[-44, 4.6, 6], 0xffc88a, 250, 88],
    [[-46, 4.2, -34], 0xffbb77, 200, 80],
    [[-58, 4.4, -58], 0xffd79b, 170, 72],
    [[-52, 5.0, 90], 0xff9d5a, 190, 80],
  ];
  const lights = fillSpots.map(([p, color, intensity, dist]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x081018, 0.00215);

  const willows = willowRows(scene);
  const gulls = gullFlock(scene, willows.roosts);
  const mist = seaMist(scene);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    trees: willows,
    gulls,
    lights,
    setStarBright(v) { star.uni.uBright.value = v; },
    setGulls(v) { gulls.on = v; },
    setMist(v) { mist.grp.visible = v; sky.uni.uMist.value = v ? 1 : 0; },
    startle(x, z, t) { return gulls.startle(x, z, t); },
    update(t, dt) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      mist.update(t);
      gulls.update(t, dt);
    },
  };
}
