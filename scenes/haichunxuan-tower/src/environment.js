/**
 * 夜空与远景：月从东北海面上来，地平一线留给镇上的火气；
 * 河东是灯市、河北是塔与寺，远处一道捍海堤的剪影压住天际。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr } from './kit.js';
import { STATIONS, SITE } from './data.js';
import * as T from './textures.js';

/**
 * 月出东北：海在塔的西北与北，月从这一带来，把整条泰东河照成一面冷镜子。
 * 天空、水面月光、平行光共用这个方向，改它等于改一整夜的朝向。
 */
export const MOON_DIR = new THREE.Vector3(0.62, 0.24, -0.75).normalize();
const HW = SITE.river.halfWidth;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function skyDome() {
  const uni = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() }, uFrost: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon; uniform float uFrost;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0040,0.0064,0.0172);
        vec3 mid    = vec3(0.010,0.015,0.034);
        vec3 horizon= vec3(0.027,0.028,0.036);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        // 灯市在东(+x)，海气在北与西北(-z, -x)：一边是火气，一边是潮气
        float warm = smoothstep(-0.15, 0.95, d.x);
        float sea = smoothstep(0.1, 0.9, -d.z) * smoothstep(-0.4, 0.6, -d.x + 0.2);
        col += vec3(0.030,0.016,0.007) * haze * (0.26 + 1.05*warm);
        col += vec3(0.010,0.017,0.024) * haze * (0.5 + 0.9*sea);
        // 月晕：升得不高，光晕在薄云上散开
        float md = max(0.0, dot(d, normalize(uMoon)));
        col += vec3(0.066,0.072,0.088) * pow(md, 14.0) * 0.5 * sky;
        col += vec3(0.050,0.058,0.082) * pow(md, 46.0) * 1.05 * sky;
        col = mix(col, col*0.94 + vec3(0.006,0.011,0.015), uFrost*0.55);
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.010,0.013,0.021), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0030,0.0042,0.0085), smoothstep(0.0, -0.05, d.y));
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

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(7.5, 24, 16), glow('#f5eee0', 1.5));
  const veil = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('232,236,248', 0.06), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  veil.scale.set(128, 128, 1);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('250,244,228', 0.12), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(54, 54, 1);
  grp.add(veil, halo, disc);
  grp.position.copy(MOON_DIR).multiplyScalar(430);
  return grp;
}

const boxG = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const meshOf = (parts, mat) => new THREE.Mesh(mergeGeometries(parts), mat);

/** 镇子与海塘的剪影带：只给轮廓与零星窗眼 */
function oldTown() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 340;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x070a12, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const o = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    // 沿河成市：密度压在南与北的河道方向，西面留给塔与寺
    let a = rand() * Math.PI * 2;
    if (Math.cos(a) < -0.3 && rand() > 0.3) a = rand() * Math.PI - Math.PI / 2;
    const band = 96 + Math.pow(rand(), 0.62) * 150;
    const x = Math.cos(a) * band * 0.72, z = Math.sin(a) * band * 1.15;
    const h = 4.2 + rand() * 9, w = 6 + rand() * 9;
    o.position.set(x, h * 0.5, z);
    o.rotation.set(0, rand() * Math.PI, 0);
    o.scale.set(w, h, w * 0.72);
    o.updateMatrix();
    bodies.setMatrixAt(i, o.matrix);
    o.position.set(x, h + 1.1, z);
    o.scale.set(w * 0.78, 2.8 + rand() * 2, w * 0.6);
    o.updateMatrix();
    roofs.setMatrixAt(i, o.matrix);
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

  // 镇外两三处远塔与一处城楼剪影，只作方向凭据，不指认是哪一座
  for (const [x, z, h] of [[-148, -142, 40], [96, -176, 32], [-186, 74, 28]]) {
    const tiers = [];
    for (let k = 0; k < 6; k++) {
      const w = 6.4 - k * 0.72;
      tiers.push(boxG(w, h / 8, w, x, (h / 8) * (k + 0.5), z));
      tiers.push(boxG(w + 1.3, 0.46, w + 1.3, x, (h / 8) * (k + 1), z));
    }
    grp.add(meshOf(tiers, silhouette));
  }
  return grp;
}

/** 东面一道捍海堤的平地起：海退之后堤只剩一条线 */
function ridges() {
  const pts = [], idx = [], col = [];
  const seg = 132, R = 470;
  const cLow = new THREE.Color('#04060d'), cHigh = new THREE.Color('#121a2a');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const east = Math.max(0, x);
    const north = Math.max(0, -z);
    // 东与北只有低平的堤线，西南隐约有镇后的高地
    const embank = (Math.abs(Math.sin(a * 3.4 + 0.9)) * 7 + Math.sin(a * 11.3) * 2.4)
      * (0.35 + 0.75 * Math.pow(east + north * 0.6, 1.4));
    const bump = embank + (20 + Math.abs(Math.sin(a * 2.1) * 22)) * Math.pow(Math.max(0, -east), 2.2);
    const h = 7 + bump;
    pts.push(x * R, -6, z * R * 0.94, x * R, h, z * R * 0.94);
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

/* ------------------------------------------------------------------ 岸柳 */
function willowFrameGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.46, 4.6, 7);
  trunk.translate(0, 2.3, 0);
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rr(-0.3, 0.3);
    const br = new THREE.CylinderGeometry(0.06, 0.16, 2.3, 5);
    br.translate(0, 1.15, 0);
    br.rotateZ(0.66 + rand() * 0.34);
    br.rotateY(a);
    br.translate(0, 4.0 + rand() * 0.6, 0);
    parts.push(br);
  }
  return mergeGeometries(parts);
}

/** 柳条：一束下垂的细枝，剪影靠它，夜里不吃光 */
function willowCanopyGeo(variant) {
  // 冠用的是多面体（无索引），细枝圆柱必须先 toNonIndexed，否则合不到一个几何里
  const parts = [];
  const n = 9 + variant * 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const r = 0.7 + rand() * 1.5;
    const len = 2.4 + rand() * 1.7;
    const strand = new THREE.CylinderGeometry(0.02, 0.16, len, 4, 1, false).toNonIndexed();
    strand.translate(0, -len / 2, 0);
    strand.rotateX(rr(-0.12, 0.12));
    strand.rotateZ(rr(-0.14, 0.14));
    strand.translate(Math.cos(a) * r, 5.5 + rand() * 0.9, Math.sin(a) * r);
    parts.push(strand);
  }
  const crown = new THREE.IcosahedronGeometry(1.25 + variant * 0.12, 0);
  crown.scale(1.2, 0.6, 1.2);
  crown.translate(0, 5.6, 0);
  parts.push(crown);
  return mergeGeometries(parts);
}

function willows(scene) {
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 7.2);
  const spots = [];
  const CR = SITE.creek;
  // 泰东河两岸 + 晏溪河北岸（犁木街前）
  for (let z = -60; z <= 66; z += 9) {
    if (rand() > 0.2) spots.push([-HW - rr(1.4, 4.6), z + rr(-3.2, 3.2)]);
    if (rand() > 0.4) spots.push([HW + rr(1.4, 4.0), z + rr(-3.6, 3.6)]);
  }
  for (let x = CR.x0 + 6; x <= CR.x1 - 4; x += 10) {
    if (rand() > 0.45) spots.push([x + rr(-2.4, 2.4), CR.z - CR.halfWidth - rr(1.6, 3.4)]);
  }
  const list = spots.filter(clear);

  const canopyMeshes = [M.leaf, M.mapleDark, M.leaf].map((m, k) =>
    new THREE.InstancedMesh(willowCanopyGeo(k), m, list.length));
  const frame = new THREE.InstancedMesh(willowFrameGeo(), M.woodDark, list.length);
  frame.castShadow = true;
  const meshes = [frame, ...canopyMeshes];

  const d = new THREE.Object3D();
  const roosts = [];
  const base = meshes.map(() => []);
  const items = [];
  list.forEach(([x, z], i) => {
    const s = rr(0.72, 1.35);
    d.position.set(x, 1.9, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.9, 1.15), s);
    d.updateMatrix();
    base[0][i] = d.matrix.clone();
    const keep = rand() > 0.16;
    canopyMeshes.forEach((c, k) => {
      if (!keep && k !== i % 3) { base[k + 1][i] = ZERO.clone(); return; }
      d.position.set(x + rr(-0.4, 0.4), 1.9 + s * 0.12, z + rr(-0.4, 0.4));
      d.scale.set(s * rr(0.9, 1.2), s * rr(0.85, 1.1), s * rr(0.9, 1.2));
      d.updateMatrix();
      base[k + 1][i] = d.matrix.clone();
    });
    roosts.push(new THREE.Vector3(x, 1.9 + s * 6.2, z));
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
    declutter(camPos) {
      let changed = false;
      items.forEach((it, i) => {
        const near = camPos.y < 13 && Math.hypot(it.x - camPos.x, it.z - camPos.z) < 4.4;
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
const CROW_COUNT = 18;
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
    const perch = i < CROW_COUNT - 5 && roosts.length;
    const home = perch ? roosts[(rand() * roosts.length) | 0].clone()
      : new THREE.Vector3(rr(-52, 52), rr(14, 24), rr(-70, 70));
    birds.push({
      home, pos: home.clone(), vel: new THREE.Vector3(),
      flap: rand() * 6.28, phase: rand() * 6.28,
      state: perch ? 'roost' : 'circle',
      circleR: rr(18, 44), circleA: rand() * 6.28, until: 0,
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
    /** 钟一响，栖鸦离枝：以撞点为心向外散 */
    startle(x, z, t) {
      let n = 0;
      for (const b of birds) {
        if (b.state !== 'roost') continue;
        const d0 = Math.hypot(b.pos.x - x, b.pos.z - z);
        if (d0 > 84) continue;
        b.state = 'fly';
        b.until = t + rr(5.5, 9.0);
        b.vel.set((b.pos.x - x) / (d0 || 1), rr(0.45, 0.85), (b.pos.z - z) / (d0 || 1))
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
          if (b.pos.y > 27) b.vel.y = Math.min(b.vel.y, 0.4);
          if (b.pos.y < 8) { b.pos.y = 8; b.vel.y = Math.abs(b.vel.y) * 0.6 + 1.2; }
          b.flap += dt * 13;
          if (t > b.until) b.state = 'return';
          pose(b.pos, Math.atan2(b.vel.x, b.vel.z), Math.sin(b.flap), false);
        } else if (b.state === 'return') {
          tmp.subVectors(b.home, b.pos);
          const need = tmp.length();
          if (need < 1.2) { b.state = b.home.y < 20 ? 'roost' : 'circle'; b.vel.set(0, 0, 0); }
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

/* ------------------------------------------------------------------ 潮气 */
function tideMist(scene) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: T.mistStreaks(), transparent: true, opacity: 0.42, color: 0xbad4e2,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const bands = [];
  for (let i = 0; i < 11; i++) {
    const w = 56 + rand() * 74, hgt = 4.5 + rand() * 7;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(rr(-HW, HW) * 1.3, 0.25 + rand() * 1.0, -120 + i * 24 + rr(-9, 9));
    m.renderOrder = 2;
    grp.add(m);
    bands.push({ m, base: m.position.z, ph: rand() * 6.28, sp: rr(0.4, 1.3) });
  }
  // 晏溪河上一条，河口一带最湿
  const m2 = new THREE.Mesh(new THREE.PlaneGeometry(46, 7), mat);
  m2.rotation.x = -Math.PI / 2;
  m2.rotation.z = Math.PI / 2;
  m2.position.set((SITE.creek.x0 + SITE.creek.x1) / 2, 0.5, SITE.creek.z);
  m2.renderOrder = 2;
  grp.add(m2);
  bands.push({ m: m2, base: m2.position.x, ph: 1.4, sp: 0.7, alongX: true });
  scene.add(grp);
  return {
    grp,
    update(t) {
      for (const b of bands) {
        if (b.alongX) b.m.position.x = b.base + Math.sin(t * 0.05 + b.ph) * 9;
        else b.m.position.z = b.base + Math.sin(t * 0.06 + b.ph) * 13;
      }
      mat.opacity = 0.22 + 0.05 * Math.sin(t * 0.18);
    },
  };
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), oldTown(), ridges());

  const trees = willows(scene);
  const crowFlock = crows(scene, trees.roosts);
  const mist = tideMist(scene);

  const hemi = new THREE.HemisphereLight(0x48699c, 0x0d1219, 0.86);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.55);
  moonLight.position.copy(MOON_DIR).multiplyScalar(180);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -104; sc.right = 104; sc.top = 104; sc.bottom = -104; sc.near = 20; sc.far = 380;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  // 月在高处，塔的东面已经能吃到光；再补一盏从灯市那边来的暖色，负责把形体model出来
  const townBounce = new THREE.DirectionalLight(0xffcb92, 0.4);
  townBounce.position.set(140, 66, 30);
  scene.add(hemi, moonLight, townBounce);

  // 暖光只来自三处：塔院与塔、犁木街与盐仓、东岸灯市
  const fillSpots = [
    [[SITE.pagoda.x + 5.5, 5.0, SITE.pagoda.z + 5.5], 0xffd2a0, 62, 46],
    [[SITE.pagoda.x - 6.0, 8.0, SITE.pagoda.z - 6.0], 0xffc07a, 92, 58],
    [[SITE.courtGate.x - 2, 4.2, SITE.courtGate.z], 0xffb066, 58, 34],
    [[SITE.granary.x + 2, 4.6, SITE.granary.z + 3], 0xffa657, 84, 44],
    [[SITE.templeGate.x, 5.0, SITE.templeGate.z - 2], 0xffca8a, 78, 42],
    [[HW + 4, 5.4, -12], 0xffbb77, 96, 48],
    [[HW + 4, 5.0, 26], 0xff9f52, 84, 44],
    [[0, 3.4, -30], 0xff8f4c, 60, 34],
  ];
  const lights = fillSpots.map(([p, color, intensity, dist]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x091322, 0.0048);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    trees,
    crows: crowFlock,
    lights,
    setStarBright(v) { star.uni.uBright.value = v; },
    setCrows(v) { crowFlock.on = v; },
    setFrost(v) { mist.grp.visible = v; sky.uni.uFrost.value = v ? 1 : 0; },
    setMist(v) { mist.grp.scale.setScalar(1); mist.grp.visible = v > 0.02; mist.grp.userData.density = v; },
    startle(x, z, t) { return crowFlock.startle(x, z, t); },
    update(t, dt) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      mist.update(t);
      crowFlock.update(t, dt);
    },
  };
}
