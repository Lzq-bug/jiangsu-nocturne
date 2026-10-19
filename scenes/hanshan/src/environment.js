import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr } from './kit.js';
import { STATIONS, CANAL } from './data.js';
import * as T from './textures.js';

/**
 * 月落：月亮已经压到寺后的山脊上，低到能把整条河照成一面冷镜子。
 * 天空、水面月光、平行光共用这个方向，改它等于改一整夜的朝向。
 */
export const MOON_DIR = new THREE.Vector3(-0.78, 0.17, -0.6).normalize();
const HW = CANAL.halfWidth;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** 天顶冷黑，地平一线留给城里的火气 */
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
        vec3 zenith = vec3(0.0040,0.0062,0.0165);
        vec3 mid    = vec3(0.010,0.015,0.034);
        vec3 horizon= vec3(0.026,0.027,0.034);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        // 河市在东(+x)，火气只堆在那一侧；西岸只剩寺后一团冷光
        float warm = smoothstep(-0.1, 0.95, d.x);
        col += vec3(0.030,0.016,0.007) * haze * (0.28 + 1.05*warm);
        col += vec3(0.008,0.014,0.020) * haze * (1.0-warm) * 0.9;
        // 落月的光晕：贴近地平时会拖出一层薄翳
        float md = max(0.0, dot(d, normalize(uMoon)));
        col += vec3(0.070,0.076,0.092) * pow(md, 14.0) * 0.55 * sky;
        col += vec3(0.052,0.060,0.084) * pow(md, 46.0) * 1.1 * sky;
        col = mix(col, col*0.94 + vec3(0.006,0.010,0.014), uFrost*0.55);
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.009,0.012,0.020), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
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

/** 落月：压在山脊上的一枚冷月，光晕比高月更大更散 */
function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(8.5, 24, 16), glow('#f7eddc', 1.45));
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
const meshOf = (parts, mat) => new THREE.Mesh(mergeGeometries(parts), mat);

/** 姑苏城与远处塔影的剪影带，只给轮廓与零星窗眼 */
function oldTown() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 380;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x070a12, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const bax = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    // 沿河成市：密度压到东岸与上下游，西面留空给寺与山
    let a = rand() * Math.PI * 2;
    if (Math.cos(a) < -0.25 && rand() > 0.25) a = rand() * Math.PI - Math.PI / 2;
    const band = 108 + Math.pow(rand(), 0.6) * 140;
    const x = Math.cos(a) * band, z = Math.sin(a) * band * 0.9;
    const h = 4.5 + rand() * 11, w = 6 + rand() * 9;
    bax.position.set(x, h * 0.5, z);
    bax.rotation.set(0, rand() * Math.PI, 0);
    bax.scale.set(w, h, w * 0.72);
    bax.updateMatrix();
    bodies.setMatrixAt(i, bax.matrix);
    bax.position.set(x, h + 1.2, z);
    bax.scale.set(w * 0.78, 3.0 + rand() * 2, w * 0.6);
    bax.updateMatrix();
    roofs.setMatrixAt(i, bax.matrix);
    if (rand() > 0.6) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.55, z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,200,140', 0.2), size: 3.0, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));

  // 城中的两座远塔，作为方向的凭据
  for (const [x, z, h] of [[86, -96, 46], [122, 62, 38]]) {
    const tiers = [];
    for (let k = 0; k < 7; k++) {
      const w = 7.6 - k * 0.82;
      tiers.push(boxG(w, h / 9, w, x, (h / 9) * (k + 0.5), z));
      tiers.push(boxG(w + 1.5, 0.5, w + 1.5, x, (h / 9) * (k + 1), z));
    }
    grp.add(meshOf(tiers, silhouette));
  }
  return grp;
}

/** 寺后的山脊：西面起得高，东面平进城里 */
function ridges() {
  const pts = [], idx = [], col = [];
  const seg = 132, R = 470;
  const cLow = new THREE.Color('#04060d'), cHigh = new THREE.Color('#111a2b');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const west = Math.max(0, -x);
    const bump = (Math.abs(Math.sin(a * 2.1 + 1.2)) * 30 + Math.abs(Math.sin(a * 5.3)) * 13 + Math.sin(a * 9.1) * 5)
      * (0.16 + 0.9 * Math.pow(west, 1.6));
    const h = 9 + bump;
    pts.push(x * R, -6, z * R * 0.9, x * R, h, z * R * 0.9);
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

/* ------------------------------------------------------------------ 江枫 */
function mapleFrameGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.20, 0.42, 4.4, 7);
  trunk.translate(0, 2.2, 0);
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rr(-0.3, 0.3);
    const br = new THREE.CylinderGeometry(0.06, 0.15, 2.5, 5);
    br.translate(0, 1.25, 0);
    br.rotateZ(0.62 + rand() * 0.3);
    br.rotateY(a);
    br.translate(0, 3.6 + rand() * 0.7, 0);
    parts.push(br);
  }
  return mergeGeometries(parts);
}
function mapleCanopyGeo(variant) {
  const parts = [];
  const n = 5 + variant;
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1.05 + rand() * 0.55, 0);
    g.scale(1.25, 0.82, 1.15);
    const a = (i / n) * Math.PI * 2 + rand();
    const r = 0.9 + rand() * 1.5;
    g.translate(Math.cos(a) * r, 4.9 + rand() * 1.7, Math.sin(a) * r);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 两岸枫树：树干一份实例，红叶按深浅分三份；近景用实例矩阵藏树，不挡镜头 */
function maples(scene) {
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 7.5);
  const spots = [];
  // 西岸寺前水弄堂最密——"江枫"就是船头那一片
  for (let z = -46; z <= 40; z += 7) {
    if (rand() > 0.18) spots.push([-HW - rr(1.2, 5.5), z + rr(-3.4, 3.4)]);
  }
  for (let z = -60; z <= 60; z += 11) {
    if (rand() > 0.45) spots.push([HW + rr(1.4, 4.2), z + rr(-4, 4)]);
  }
  for (let i = 0; i < 10; i++) spots.push([rr(-HW - 8, HW + 10), rr(-70, 52)]);
  const list = spots.filter(clear);

  const canopyMeshes = [M.mapleA, M.mapleB, M.mapleC].map((m, k) =>
    new THREE.InstancedMesh(mapleCanopyGeo(k), m, list.length));
  const frame = new THREE.InstancedMesh(mapleFrameGeo(), M.mapleDark, list.length);
  frame.castShadow = true;
  const meshes = [frame, ...canopyMeshes];

  const d = new THREE.Object3D();
  const roosts = [];
  const base = meshes.map(() => []);
  const items = [];
  list.forEach(([x, z], i) => {
    const s = rr(0.78, 1.5);
    d.position.set(x, 2.0, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.92, 1.15), s);
    d.updateMatrix();
    base[0][i] = d.matrix.clone();
    const keep = rand() > 0.22;
    canopyMeshes.forEach((c, k) => {
      if (!keep && k !== i % 3) { base[k + 1][i] = ZERO.clone(); return; }
      d.position.set(x + rr(-0.5, 0.5), 2.0 + s * 0.1, z + rr(-0.5, 0.5));
      d.scale.set(s * rr(0.9, 1.2), s * rr(0.85, 1.1), s * rr(0.9, 1.2));
      d.updateMatrix();
      base[k + 1][i] = d.matrix.clone();
    });
    roosts.push(new THREE.Vector3(x, 2.0 + s * 5.6, z));
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
    /** 走进去时把身边的树缩掉，站姿才不会被一坨红叶糊住 */
    declutter(camPos) {
      let changed = false;
      items.forEach((it, i) => {
        const near = camPos.y < 13 && Math.hypot(it.x - camPos.x, it.z - camPos.z) < 4.6;
        if (near === it.hidden) return;
        it.hidden = near;
        changed = true;
        meshes.forEach((m, k) => m.setMatrixAt(i, near ? ZERO : base[k][i]));
      });
      if (changed) meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    },
  };
}

/* ------------------------------------------------------------------ 乌啼 */
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
      : new THREE.Vector3(rr(-44, 44), rr(13, 21), rr(-66, 66));
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
    /** 钟一响，栖鸦惊起：以撞点为心向外散 */
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
    flying() { return birds.filter((b) => b.state === 'fly' || b.state === 'return').length; },
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
          if (b.pos.y > 26) b.vel.y = Math.min(b.vel.y, 0.4);
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

/* ------------------------------------------------------------------ 霜气 */
function frostMist(scene) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: T.mistStreaks(), transparent: true, opacity: 0.45, color: 0xbcd6e6,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const bands = [];
  // 霜气只贴着水面一层：低相机位看得见，抬高机位时它已经化进水里
  for (let i = 0; i < 9; i++) {
    const w = 60 + rand() * 70, h = 5 + rand() * 7;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(rr(-HW, HW) * 1.4, 0.3 + rand() * 1.0, -115 + i * 28 + rr(-10, 10));
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
        b.m.position.z = b.base + Math.sin(t * 0.06 + b.ph) * 14;
      }
      mat.opacity = 0.24 + 0.05 * Math.sin(t * 0.18);
    },
  };
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), oldTown(), ridges());

  const trees = maples(scene);
  const crowFlock = crows(scene, trees.roosts);
  const mist = frostMist(scene);

  const hemi = new THREE.HemisphereLight(0x4a6896, 0x0d1219, 0.88);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 1.5);
  moonLight.position.copy(MOON_DIR).multiplyScalar(170);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -92; sc.right = 92; sc.top = 92; sc.bottom = -92; sc.near = 20; sc.far = 360;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  // 月落得太低，屋脊几乎接不住光；补一盏从河东城里过来的暖色天光，只负责把形体模型出来
  const cityBounce = new THREE.DirectionalLight(0xffcb92, 0.44);
  cityBounce.position.set(130, 74, 40);
  scene.add(hemi, moonLight, cityBounce);

  // 暖光只来自三处：寺前灯、渔火、东岸河市
  const fillSpots = [
    [[-15.5, 6.2, -2], 0xffc07a, 150, 70],
    [[-19.2, 7.4, 6.5], 0xffb066, 120, 58],
    [[-26.0, 8.5, -2], 0xffca8a, 150, 74],
    [[-6.5, 3.2, 22], 0xff8f4c, 95, 42],
    [[16.0, 5.4, 14], 0xffa657, 150, 66],
    [[15.0, 6.0, 40], 0xffbb77, 110, 58],
    [[-2.0, 7.5, 34], 0xffd2a0, 90, 52],
  ];
  const lights = fillSpots.map(([p, color, intensity, dist]) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x091322, 0.005);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    trees,
    crows: crowFlock,
    lights,
    setStarBright(v) { star.uni.uBright.value = v; },
    setCrows(v) { crowFlock.on = v; },
    setFrost(v) { mist.grp.visible = v; sky.uni.uFrost.value = v ? 1 : 0; },
    startle(x, z, t) { return crowFlock.startle(x, z, t); },
    update(t, dt) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      mist.update(t);
      crowFlock.update(t, dt);
    },
  };
}
