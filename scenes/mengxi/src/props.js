import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, glow, lit, rand, rr, figureGeo, registerOccluder, M } from './kit.js';
import * as T from './textures.js';
import { ALLEY, GARDEN, GROUND, STATIONS } from './data.js';

/* ------------------------------------------------------------------ 灯笼 */
let paperWarm = null, paperJade = null;
function lanternMats() {
  if (!paperWarm) {
    // 纸面本身不该过曝：亮度靠 bloom 提，不靠把颜色推到 1 以上
    paperWarm = new THREE.MeshBasicMaterial({ map: T.lanternPaper('#fff1cf', '#e2704a'), color: 0x9a8570, toneMapped: false, fog: false });
    paperJade = new THREE.MeshBasicMaterial({ map: T.lanternPaper('#e6fff4', '#3f9f86'), color: 0x8fa09a, toneMapped: false, fog: false });
    paperWarm.userData = { base: 1 };
  }
  return { warm: paperWarm, jade: paperJade };
}

const lampParts = { body: null, cap: null, tass: null };
function lampGeo() {
  if (!lampParts.body) {
    const body = new THREE.SphereGeometry(0.3, 14, 11);
    body.scale(1, 0.84, 1);
    lampParts.body = body;
    const cap = new THREE.CylinderGeometry(0.15, 0.19, 0.1, 10);
    const cap2 = cap.clone();
    cap.translate(0, 0.25, 0);
    cap2.translate(0, -0.25, 0);
    lampParts.cap = mergeGeometries([cap, cap2]);
    const tass = new THREE.ConeGeometry(0.06, 0.26, 6);
    tass.translate(0, -0.42, 0);
    lampParts.tass = tass;
  }
  return lampParts;
}

class Lantern {
  constructor(parent, pos, { scale = 1, jade = false, big = false } = {}) {
    const g = lampGeo();
    const mats = lanternMats();
    this.grp = new THREE.Group();
    this.body = new THREE.Mesh(g.body, jade ? mats.jade : mats.warm);
    this.grp.add(this.body);
    this.grp.add(new THREE.Mesh(g.cap, M.timberDark));
    const tass = new THREE.Mesh(g.tass, M.mxBrickDark);
    this.grp.add(tass);
    if (big) {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 5, 14), M.gilt);
      frame.rotation.x = Math.PI / 2;
      this.grp.add(frame);
    }
    this.grp.scale.setScalar(scale);
    this.grp.position.set(pos[0], pos[1], pos[2]);
    this.phase = rand() * 6.28;
    this.base = this.grp.rotation.z;
    parent.add(this.grp);
    this.jade = jade;
    this.mats = mats;
  }
  update(t, k) {
    this.grp.rotation.z = this.base + Math.sin(t * 0.9 + this.phase) * 0.05;
    this.grp.rotation.x = Math.sin(t * 0.7 + this.phase * 1.4) * 0.03;
    this.body.visible = k > 0.02;
  }
}

/* ------------------------------------------------------------------ 竹 */
function bambooGeo() {
  const parts = [];
  const h = 4.4 + rand() * 2.2;
  const culm = new THREE.CylinderGeometry(0.045, 0.07, h, 6);
  culm.translate(0, h / 2, 0);
  parts.push(culm);
  for (let i = 1; i < 5; i++) {
    const node = new THREE.TorusGeometry(0.055, 0.012, 4, 8);
    node.rotateX(Math.PI / 2);
    node.translate(0, (h * i) / 5, 0);
    parts.push(node);
  }
  for (let i = 0; i < 4; i++) {
    const branch = new THREE.CylinderGeometry(0.018, 0.028, 0.9 + rand() * 0.6, 4);
    branch.translate(0.42, 0, 0);
    branch.rotateZ(rr(-0.5, -0.15));
    branch.rotateY((i / 4) * Math.PI * 2 + rand());
    branch.translate(0, h * rr(0.55, 0.92), 0);
    parts.push(branch);
  }
  // 竹叶：一簇簇细长菱形，夜里只读得出疏密——要紧贴在秆上，不然散成满天纸片
  const leaf = new THREE.PlaneGeometry(0.34, 0.07);
  const leaves = [];
  for (let i = 0; i < 22; i++) {
    const g = leaf.clone();
    g.rotateZ(rr(-0.9, 0.9));
    g.rotateY(rand() * Math.PI);
    const a = rand() * 6.28, r = rr(0.05, 0.62);
    g.translate(Math.cos(a) * r, h * rr(0.68, 1.02), Math.sin(a) * r);
    leaves.push(g);
  }
  const leafMerged = mergeGeometries(leaves.map((p) => p.toNonIndexed()));
  return { culm: mergeGeometries(parts), leaves: leafMerged, h };
}

function bambooGrove(cx, cz, n = 22, spread = 3.4) {
  const grp = new THREE.Group();
  const culmMat = lit('#5c6b4a', { rough: 0.85, emissive: '#101a12', ei: 0.5 });
  const leafMat = lit('#33472f', { rough: 0.95, side: THREE.DoubleSide, emissive: '#0d1710', ei: 0.5 });
  // 一丛竹只备六套几何，其余靠缩放与转向错开
  const protos = [];
  for (let i = 0; i < 6; i++) protos.push(bambooGeo());
  for (let i = 0; i < n; i++) {
    const b = protos[i % protos.length];
    const a = rand() * 6.28, r = Math.sqrt(rand()) * spread;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const s = rr(0.72, 1.2);
    const c = new THREE.Mesh(b.culm, culmMat);
    c.position.set(x, GROUND - 0.1, z);
    c.scale.setScalar(s);
    c.rotation.set(rr(-0.06, 0.06), rand() * 6.28, rr(-0.06, 0.06));
    c.castShadow = true;
    const l = new THREE.Mesh(b.leaves, leafMat);
    l.position.copy(c.position);
    l.scale.setScalar(s);
    l.rotation.y = c.rotation.y;
    grp.add(c, l);
  }
  return registerOccluder(grp, 2.6, new THREE.Vector3(cx, GROUND + 1.5, cz));
}

/* ------------------------------------------------------------------ 梅 / 桂 */
function treeGeo(kind) {
  const parts = [];
  const trunkH = kind === 'plum' ? 2.2 : 2.8;
  const trunk = new THREE.CylinderGeometry(kind === 'plum' ? 0.1 : 0.16, kind === 'plum' ? 0.24 : 0.3, trunkH, 7);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(trunk);
  const nBranch = kind === 'plum' ? 7 : 5;
  for (let i = 0; i < nBranch; i++) {
    const len = kind === 'plum' ? rr(1.3, 2.4) : rr(1.1, 1.7);
    const b = new THREE.CylinderGeometry(0.03, kind === 'plum' ? 0.07 : 0.1, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(rr(0.35, 1.05) * (i % 2 ? 1 : -1));
    b.rotateY((i / nBranch) * Math.PI * 2 + rand());
    b.translate(0, trunkH * rr(0.55, 0.95), 0);
    parts.push(b);
  }
  const canopy = [];
  if (kind === 'cassia') {
    for (let i = 0; i < 6; i++) {
      const g = new THREE.IcosahedronGeometry(rr(0.9, 1.4), 1).toNonIndexed();
      g.scale(1.2, 0.8, 1.1);
      const a = rand() * 6.28, r = rr(0.2, 1.3);
      g.translate(Math.cos(a) * r, trunkH + rr(0.4, 1.5), Math.sin(a) * r);
      canopy.push(g);
    }
  }
  return { body: mergeGeometries(parts.map((p) => p.toNonIndexed())), canopy: canopy.length ? mergeGeometries(canopy) : null, trunkH };
}

function tree(kind, x, z, scale = 1) {
  const grp = new THREE.Group();
  const g = treeGeo(kind);
  const bark = lit(kind === 'plum' ? '#4a3a33' : '#3b3a35', { rough: 0.92 });
  grp.add(new THREE.Mesh(g.body, bark));
  if (g.canopy) {
    const leaf = lit('#2c4032', { rough: 0.95, side: THREE.DoubleSide, emissive: '#0b1410', ei: 0.55 });
    grp.add(new THREE.Mesh(g.canopy, leaf));
  }
  if (kind === 'plum') {
    // 梅花：点点冷白，靠自发光在夜里读得出来
    const pts = [];
    for (let i = 0; i < 80; i++) {
      const a = rand() * 6.28, r = rr(0.4, 2.0);
      pts.push(Math.cos(a) * r, g.trunkH + rr(0.2, 1.9) - r * 0.18, Math.sin(a) * r * 0.85);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const bm = new THREE.PointsMaterial({
      map: T.softGlow('255,232,236', 0.16), size: 0.17, transparent: true, color: 0xd8d2d0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true,
    });
    grp.add(new THREE.Points(bg, bm));
  }
  grp.position.set(x, GROUND - 0.08, z);
  grp.scale.setScalar(scale);
  grp.castShadow = true;
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return registerOccluder(grp, 2.2, new THREE.Vector3(x, GROUND + 1.4, z));
}

/* ------------------------------------------------------------------ 井台 */
function well(x, z) {
  const grp = new THREE.Group();
  const curb = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = box(0.62, 0.55, 0.26, 0, 0.28, 0);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.66, 0, Math.sin(a) * 0.66);
    curb.push(g);
  }
  const stones = mergeGeometries(curb);
  const ring = new THREE.Mesh(stones, M.mxBrick);
  ring.castShadow = ring.receiveShadow = true;
  grp.add(ring);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 12), glow('#03060b', 0.2));
  mouth.position.y = 0.52;
  grp.add(mouth);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.6, 6), M.timberDark);
    post.position.set(s * 0.72, 0.8, 0);
    grp.add(post);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), M.timber);
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 1.56;
  grp.add(beam);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 8), M.timberDark);
  roller.rotation.z = Math.PI / 2;
  roller.position.set(0.18, 1.5, 0);
  grp.add(roller);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 4), lit('#8c7a5a', { rough: 0.9 }));
  rope.position.set(0.18, 1.0, 0);
  grp.add(rope);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.24, 9), M.timberDark);
  bucket.position.set(0.18, 0.5, 0);
  grp.add(bucket);
  // 井台边的青苔石
  grp.add(new THREE.Mesh(box(1.5, 0.12, 1.1, 0, 0.02, 0), M.ashl));
  grp.position.set(x, GROUND, z);
  return grp;
}

/* ------------------------------------------------------------------ 晾衣 */
function laundry(x0, x1, y, z) {
  const grp = new THREE.Group();
  const clothMat = lit('#7f8898', { rough: 0.95, side: THREE.DoubleSide, emissive: '#121820', ei: 0.4 });
  const clothWarm = lit('#9c6f5c', { rough: 0.95, side: THREE.DoubleSide, emissive: '#1a1010', ei: 0.4 });
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.42, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 4, false), M.timberDark);
  grp.add(rope);
  for (let i = 0; i < 5; i++) {
    const t = 0.12 + i * 0.19;
    const p = curve.getPoint(t);
    const w = rr(0.4, 0.7), h = rr(0.6, 1.1);
    const g = new THREE.PlaneGeometry(w, h, 3, 6);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const yy = pos.getY(k);
      pos.setZ(k, Math.sin((yy / h + 0.5) * 3 + i) * 0.06 * (1 - (yy + h / 2) / h));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, i % 2 ? clothWarm : clothMat);
    m.position.set(p.x, p.y - h / 2 - 0.04, p.z);
    m.rotation.y = rr(-0.12, 0.12);
    m.castShadow = true;
    grp.add(m);
  }
  return grp;
}

/* ------------------------------------------------------------------ 石灯 */
function stoneLamp(x, z, jade = false) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(box(0.5, 0.2, 0.5, 0, 0.1, 0), M.mxBrick));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.9, 8), M.mxBrickDark);
  shaft.position.y = 0.62;
  grp.add(shaft);
  const boxFire = new THREE.Mesh(box(0.46, 0.34, 0.46, 0, 1.24, 0), M.mxBrick);
  grp.add(boxFire);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), glow(jade ? '#9ff0d8' : '#ffdcae', 0.85));
  win.position.set(0, 1.24, 0.24);
  grp.add(win);
  const win2 = win.clone();
  win2.rotation.y = Math.PI;
  win2.position.z = -0.24;
  grp.add(win2);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 4, 1), M.mxTile);
  roof.position.y = 1.55;
  roof.rotation.y = Math.PI / 4;
  grp.add(roof);
  grp.position.set(x, GROUND - 0.05, z);
  grp.scale.setScalar(0.78);
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

/* ------------------------------------------------------------------ 流萤 */
class Motes {
  constructor(count, box3) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rr(box3[0][0], box3[0][1]);
      pos[i * 3 + 1] = rr(box3[1][0], box3[1][1]);
      pos[i * 3 + 2] = rr(box3[2][0], box3[2][1]);
      seed[i] = rand() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uK: { value: 1 },
        uTex: { value: T.softGlow('212,255,190', 0.06) },
      },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float uK; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime*0.5 + aSeed)*1.7 + sin(uTime*0.21 + aSeed*2.3)*0.9;
          p.y += sin(uTime*0.36 + aSeed*1.7)*0.55;
          p.z += cos(uTime*0.44 + aSeed*1.3)*1.5;
          float blink = pow(max(0.0, sin(uTime*1.7 + aSeed*3.1)), 9.0);
          vA = blink * uK;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_PointSize = (2.4 + blink*3.0) * (24.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.82,1.0,0.7), t.a*vA*0.5); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  update(t, k) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uK.value = k;
    this.points.visible = k > 0.02;
  }
}

/* ------------------------------------------------------------------ 巷中行人 */
class Crowd {
  constructor(n) {
    this.grp = new THREE.Group();
    this.items = [];
    // 机位是站定看景的，人不能堵在镜头前
    this.eyes = STATIONS.map((s) => [s.pos[0], s.pos[2]]);
    const mat = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.95 });
    mat.emissive = new THREE.Color('#0a1220'); mat.emissiveIntensity = 0.6;
    const geo = figureGeo(1.22);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const lane = rand() > 0.5 ? 1 : -1;
      m.castShadow = true;
      this.items.push({
        mesh: m,
        x: rr(ALLEY.xFrom + 3, GARDEN.xTo - 20),
        dir: rand() > 0.5 ? 1 : -1,
        speed: rr(0.55, 1.15),
        z: lane * rr(0.4, 2.3),
        phase: rand() * 6.28,
        garden: i % 3 === 0,
      });
      this.grp.add(m);
    }
  }
  update(t, dt, count) {
    this.items.forEach((p, i) => {
      let on = i < count;
      p.x += p.dir * p.speed * dt;
      if (p.garden) {
        if (p.x > 22) p.x = 4.5;
        if (p.x < 4.5) p.x = 22;
        p.z = Math.sin(p.x * 0.3 + p.phase) * 3.2;
      } else {
        if (p.x > ALLEY.xTo + 2) p.x = ALLEY.xFrom + 2;
        if (p.x < ALLEY.xFrom + 2) p.x = ALLEY.xTo + 2;
      }
      for (const [ex, ez] of this.eyes) {
        if (Math.hypot(p.x - ex, p.z - ez) < 9.5) { on = false; break; }
      }
      p.mesh.visible = on;
      if (!on) return;
      const bob = Math.sin(t * 6.5 + p.phase) * 0.022;
      p.mesh.position.set(p.x, GROUND + bob, p.z);
      p.mesh.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    });
  }
}

export function buildProps(scene, anchors) {
  lanternMats();
  const grp = new THREE.Group();
  grp.name = 'props';

  const lanterns = [];
  const lanternKinds = { gate: 1.35, alley: 0.95, yard: 1.1, pavilion: 1.2, garden: 1.0 };
  for (const l of anchors.lamps) {
    const s = lanternKinds[l.kind] ?? lanternKinds.alley;
    lanterns.push(new Lantern(grp, l.pos, { scale: s, big: l.big, jade: l.kind === 'garden' }));
  }
  // 园门内、溪亭檐下、书斋檐前再加几盏
  for (const p of [
    [GARDEN.xFrom + 1.1, GROUND + 2.75, 1.6], [GARDEN.xFrom + 1.1, GROUND + 2.75, -1.6],
    [16.0, GROUND + 2.9, 12.0], [16.0, GROUND + 2.9, 6.2],
    [30.0, GROUND + 2.6, -10.4], [17.4, GROUND + 1.35, -4.8],
  ]) lanterns.push(new Lantern(grp, p, { scale: 1.05, jade: p[2] < -6, big: false }));

  grp.add(bambooGrove(-2.6, 5.6, 16, 2.6));
  grp.add(bambooGrove(-4.2, -6.2, 12, 2.2));
  grp.add(bambooGrove(6.2, 17.4, 20, 3.2));
  grp.add(bambooGrove(41.0, -16.5, 14, 2.6));
  grp.add(tree('plum', 20.4, -9.4, 1.05));
  grp.add(tree('plum', 32.6, -8.2, 0.85));
  grp.add(tree('cassia', 15.2, 3.4, 1.0));
  grp.add(tree('cassia', 39.2, 7.6, 1.15));
  grp.add(tree('plum', -13.2, -5.4, 0.8));

  grp.add(well(-29.6, -1.5));
  grp.add(laundry(-48.5, -41.5, GROUND + 2.55, -1.9));
  grp.add(laundry(-38.2, -32.5, GROUND + 2.35, 2.1));
  grp.add(stoneLamp(4.6, 2.4, true));
  grp.add(stoneLamp(19.4, -5.6, false));
  grp.add(stoneLamp(28.8, 9.8, false));
  grp.add(stoneLamp(-51.5, 2.35, false));
  // 门槛石与门枕：巷两侧的住户门位
  for (const [dx, s] of [[-52, -1], [-36.5, -1], [-24.5, -1], [-46, 1], [-31, 1], [-21, 1]]) {
    grp.add(new THREE.Mesh(box(1.35, 0.16, 0.5, dx, GROUND + 0.08, s * (ALLEY.halfZ - 0.2)), M.ashl));
    for (const k of [-1, 1]) {
      grp.add(new THREE.Mesh(box(0.3, 0.42, 0.36, dx + k * 0.7, GROUND + 0.2, s * (ALLEY.halfZ - 0.3)), M.mxBrick));
    }
  }

  const motes = new Motes(56, [[8, 40], [GROUND + 0.2, GROUND + 2.2], [-18, 18]]);
  grp.add(motes.points);
  const crowd = new Crowd(14);
  grp.add(crowd.grp);

  scene.add(grp);

  return {
    grp,
    lanterns,
    motes,
    crowd,
    setLanterns(k) {
      const c = Math.min(1.6, k);
      paperWarm.color.setScalar(Math.max(0.02, 0.6 * c));
      paperJade.color.setScalar(Math.max(0.02, 0.56 * c));
      for (const l of lanterns) l.update(0, k);
    },
    update(t, dt, state, eye) {
      for (const l of lanterns) l.update(t, state.lantern);
      motes.update(t, state.firefly);
      crowd.update(t, dt, state.people, eye);
    },
  };
}
