import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, stringPath, figureGeo, loftHull, box, chineseRoof } from './kit.js';
import { RIVER } from './data.js';
import { WATER_Y } from './water.js';
import * as T from './textures.js';

const Q = RIVER.quayY, HW = RIVER.halfWidth;
const WARM = () => (rand() > 0.82 ? '#ff8a5c' : rand() > 0.4 ? '#ffbe72' : '#ffd08a');

const roundGeo = new THREE.SphereGeometry(0.42, 12, 9);
roundGeo.scale(1, 0.84, 1);
const hexGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.72, 6);
const capGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.14, 8);

class InstancedGlow extends THREE.InstancedMesh {
  constructor(geo, material, max) {
    super(geo, material, max);
    this.d = new THREE.Object3D();
    this.capacity = max;
    this.frustumCulled = false;
  }
  put(i, p, scale, rotY, color) {
    const d = this.d;
    d.position.copy(p);
    d.scale.setScalar(scale);
    d.rotation.set(0, rotY, 0);
    d.updateMatrix();
    this.setMatrixAt(i, d.matrix);
    this.setColorAt(i, color);
  }
}

/** every fixed lamp in the scene, sorted so the density slider just darkens the tail */
export class LanternField {
  constructor(scene, columns) {
    this.entries = [];
    this.columns = columns;
    const paper = T.lanternPaper();
    const body = () => new THREE.MeshBasicMaterial({ map: paper, toneMapped: false, fog: true });
    this.meshes = {
      round: new InstancedGlow(roundGeo, body(), 700),
      hex: new InstancedGlow(hexGeo, body(), 700),
      cap: new InstancedGlow(capGeo, glow('#d8ab63', 0.7), 1400),
    };
    scene.add(this.meshes.round, this.meshes.hex, this.meshes.cap);

    this.haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,190,120', 0.06) }, uOn: { value: 1 } },
      vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
        uniform float uTime; uniform float uOn; varying vec3 vC; varying float vA;
        void main(){
          vC = aCol; vA = uOn * (0.76 + 0.24*sin(uTime*2.4 + aPhase*6.28));
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = min(58.0, aSize * 300.0 / max(1.0,-mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.13); }`,
    });
    this.haloGeo = new THREE.BufferGeometry();
    this.halo = new THREE.Points(this.haloGeo, this.haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    scene.add(this.halo);
  }
  add(p, { color = WARM(), size = 1, shape = 'auto', column = false, columnDepth = 8, columnWidth = 1.05 } = {}) {
    this.entries.push({
      p: p.clone(), color: new THREE.Color(color), size, column, columnDepth, columnWidth,
      shape: shape === 'auto' ? (rand() > 0.45 ? 'round' : 'hex') : shape,
      rank: rand(),
    });
  }
  build() {
    this.entries.sort((a, b) => a.rank - b.rank);
    const n = this.entries.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
    const tmp = new THREE.Color();
    this.prefix = { round: [], hex: [], cap: 0 };
    this.colOf = [];
    let r = 0, h = 0, c = 0;
    this.entries.forEach((e, i) => {
      const bright = 1.0 + rand() * 0.6;
      tmp.copy(e.color).multiplyScalar(bright);
      if (e.shape === 'round') { this.meshes.round.put(r, e.p, e.size, rand() * 3, tmp); this.prefix.round.push(i); r++; }
      else { this.meshes.hex.put(h, e.p, e.size, rand() * 3, tmp); this.prefix.hex.push(i); h++; }
      tmp.copy(e.color).multiplyScalar(0.55);
      this.meshes.cap.put(c++, e.p.clone().setY(e.p.y + e.size * 0.44), e.size * 0.8, 0, tmp);
      pos[3 * i] = e.p.x; pos[3 * i + 1] = e.p.y; pos[3 * i + 2] = e.p.z;
      tmp.copy(e.color).multiplyScalar(bright);
      col[3 * i] = tmp.r; col[3 * i + 1] = tmp.g; col[3 * i + 2] = tmp.b;
      size[i] = e.size * 2.6;
      phase[i] = rand();
      if (e.column) this.colOf[i] = this.columns.add(e.p, e.color, e.columnWidth * e.size, e.columnDepth, 1.15);
    });
    this.capacity = { round: r, hex: h, cap: c };
    [this.meshes.round, this.meshes.hex, this.meshes.cap].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    this.haloGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.haloGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    this.haloGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.haloGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.total = n;
    this.setDensity(1);
  }
  static litCount(prefix, lit) {
    let lo = 0, hi = prefix.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (prefix[mid] < lit) lo = mid + 1; else hi = mid; }
    return lo;
  }
  /** fraction of lamps kept lit (0..1.5, values >1 just saturate) */
  setDensity(fraction) {
    const lit = Math.max(0, Math.min(this.total, Math.round(Math.min(1, fraction) * this.total)));
    const nr = LanternField.litCount(this.prefix.round, lit);
    const nh = LanternField.litCount(this.prefix.hex, lit);
    this.meshes.round.count = nr;
    this.meshes.hex.count = nh;
    this.meshes.cap.count = nr + nh;
    this.haloGeo.setDrawRange(0, lit);
    this.haloMat.uniforms.uOn.value = lit > 0 ? 1 : 0;
    this.entries.forEach((e, i) => {
      if (this.colOf[i] !== undefined) this.columns.setOn(this.colOf[i], i < lit);
    });
    this.litCount = lit;
  }
  update(t) { this.haloMat.uniforms.uTime.value = t; }
}

/* ------------------------------------------------------------------ overhead strings */
function overheadStrings(scene, anchors, columns) {
  const grp = new THREE.Group();
  const linePos = [], bulbPos = [], bulbCol = [], bulbSize = [], bulbPhase = [];
  const warm = new THREE.Color('#ffcf8a'), red = new THREE.Color('#ff7f5e'), jade = new THREE.Color('#8ff0d2');
  anchors.stringEnds.forEach((pair, k) => {
    const pts = stringPath(pair[0], pair[1], 2.6 + rand() * 1.2, 34);
    for (let i = 0; i < pts.length - 1; i++) {
      linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    for (let i = 2; i < pts.length - 1; i += 2) {
      const p = pts[i];
      bulbPos.push(p.x, p.y - 0.3, p.z);
      const c = (i + k) % 7 === 0 ? jade : (i + k) % 3 === 0 ? red : warm;
      bulbCol.push(c.r * 2.2, c.g * 2.2, c.b * 2.2);
      bulbSize.push(1.5 + rand() * 0.8);
      bulbPhase.push(rand());
    }
    const mid = pts[Math.floor(pts.length / 2)];
    columns.add(mid.clone().setY(mid.y - 1.4), '#ffc37a', 2.4, 13, 0.75);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x121826, fog: false })));

  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
  bg.setAttribute('aCol', new THREE.Float32BufferAttribute(bulbCol, 3));
  bg.setAttribute('aSize', new THREE.Float32BufferAttribute(bulbSize, 1));
  bg.setAttribute('aPhase', new THREE.Float32BufferAttribute(bulbPhase, 1));
  const bm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,205,150', 0.05) }, uOn: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
      uniform float uTime; uniform float uOn; varying vec3 vC; varying float vA;
      void main(){ vC = aCol; vA = uOn*(0.7+0.3*sin(uTime*3.1+aPhase*6.28));
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = min(42.0, aSize*260.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.35); }`,
  });
  const bulbs = new THREE.Points(bg, bm);
  bulbs.frustumCulled = false;
  bulbs.renderOrder = 5;
  grp.add(bulbs);
  scene.add(grp);
  return { grp, uni: bm.uniforms, bulbCount: bulbs };
}

/* ------------------------------------------------------------------ 画舫 */
const GEO = {};
function boatGeometry() {
  if (GEO.hull) return GEO.hull;
  const stations = [-7.2, -5.4, -2.4, 2.4, 5.4, 7.2];
  const profile = (z) => {
    const t = Math.abs(z) / 7.2;
    const b = 1.28 * Math.pow(Math.max(0.02, 1 - t * t * 0.96), 0.62);
    return [[-b, 0.62], [-b * 0.92, -0.16], [-b * 0.4, -0.6], [b * 0.4, -0.6], [b * 0.92, -0.16], [b, 0.62], [b * 0.55, 0.8], [-b * 0.55, 0.8]];
  };
  const parts = [loftHull(profile, stations, false)];
  parts.push(box(2.1, 0.16, 13.6, 0, 0.88, 0));
  parts.push(box(2.5, 0.22, 13.9, 0, 1.0, 0));
  const bow = new THREE.ConeGeometry(0.55, 2.2, 6);
  bow.rotateX(-Math.PI / 2);
  bow.translate(0, 0.5, -8.1);
  parts.push(bow);
  parts.push(box(1.9, 0.9, 0.9, 0, 0.7, 7.4));
  GEO.hull = mergeGeometries(parts);
  return GEO.hull;
}
function cabinGeometry() {
  if (GEO.cabin) return GEO.cabin;
  const parts = [];
  parts.push(box(2.3, 2.1, 6.4, 0, 2.1, 0.4));
  parts.push(box(2.7, 0.22, 6.9, 0, 3.2, 0.4));
  const r1 = chineseRoof({ width: 3.4, depth: 7.6, height: 0.72, ridgeRatio: 0.6, curve: 0.4, eaveLift: 0.5, overhang: 0.25 });
  r1.rotateY(Math.PI / 2);
  r1.translate(0, 3.4, 0.4);
  parts.push(r1);
  const r2 = chineseRoof({ width: 2.2, depth: 4.6, height: 0.6, ridgeRatio: 0.5, curve: 0.4, eaveLift: 0.45, overhang: 0.2 });
  r2.rotateY(Math.PI / 2);
  r2.translate(0, 4.15, 0.4);
  parts.push(r2);
  GEO.cabin = mergeGeometries(parts);
  return GEO.cabin;
}

class Fleet {
  constructor(scene, columns, { count = 7 } = {}) {
    this.columns = columns;
    this.boats = [];
    for (let i = 0; i < count; i++) {
      const b = this.makeBoat(i);
      b.lane = (i % 2 ? 4.8 : -5.0) + rr(-1.1, 1.1);
      b.t = rand();
      b.dir = i % 2 ? 1 : -1;
      b.speed = rr(0.0052, 0.009);
      b.phase = rand() * 6.28;
      this.boats.push(b);
      scene.add(b.grp);
    }
    for (let i = 0; i < 2; i++) {
      const b = this.makeBoat(100 + i);
      b.grp.position.set(-12.4 - i * 3.6, WATER_Y + 0.5, -79 + i * 7.0);
      b.grp.rotation.y = i ? 0.16 : -0.1;
      b.moored = true;
      b.phase = rand() * 6.28;
      this.boats.push(b);
      scene.add(b.grp);
    }
  }
  makeBoat(id) {
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(boatGeometry(), M.beam);
    hull.castShadow = true;
    const cabin = new THREE.Mesh(cabinGeometry(), M.pillarBright);
    cabin.position.y = 1.1;
    cabin.castShadow = true;
    grp.add(hull, cabin);
    const pane = new THREE.PlaneGeometry(1.3, 1.15);
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(pane, M.lattice);
        w.position.set(s * 1.17, 2.15, -1.8 + i * 2.1);
        w.rotation.y = s * Math.PI / 2;
        grp.add(w);
      }
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), M.lattice);
    front.position.set(0, 2.15, 3.75);
    grp.add(front);
    const lampMat = glow(id % 3 === 0 ? '#ff9a6a' : '#ffd28f', 1.5);
    for (const z of [-5.6, 4.9]) {
      const l = new THREE.Mesh(roundGeo, lampMat);
      l.position.set(0, 2.2, z);
      l.scale.setScalar(0.85);
      grp.add(l);
      grp.add(new THREE.Mesh(box(0.05, 1.2, 0.05, 0, 2.9, z), M.ink));
    }
    for (const z of [-1.5, 1.5]) {
      const l = new THREE.Mesh(hexGeo, glow('#ff8c5e', 1.35));
      l.position.set(0, 4.6, z + 0.4);
      grp.add(l);
    }
    const boatman = new THREE.Mesh(figureGeo(0.9), M.ink);
    boatman.position.set(0, 1.1, 6.4);
    const oar = new THREE.Mesh(box(0.1, 0.1, 3.6, 0, 1.3, 8.3), M.beam);
    oar.rotation.x = 0.45;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), M.silk);
    flag.position.set(0, 5.7, 5.6);
    const mast = new THREE.Mesh(box(0.09, 2.5, 0.09, 0, 4.5, 5.6), M.ink);
    grp.add(boatman, oar, flag, mast);

    const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 10), new THREE.MeshBasicMaterial({
      map: T.softGlow('210,230,255', 0.15), transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, WATER_Y + 0.08, 9);
    grp.add(foam);

    const v = new THREE.Vector3();
    const b = {
      grp, foam, _v: v,
      colBow: this.columns.add(v.set(0, 0, 0), '#ffd0a0', 1.2, 5.5, 1.0),
      colCabin: this.columns.add(v.set(0, 0, 0), '#ffb877', 2.6, 12, 1.25),
      colStern: this.columns.add(v.set(0, 0, 0), '#ff9a68', 1.3, 6, 0.9),
    };
    b.colRef = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    return b;
  }
  /** the first moored boat, whose cabin you can step into */
  moored(i = 0) {
    const b = this.boats.filter((x) => x.moored)[i];
    return b ? b.grp : null;
  }
  update(t, dt, speedScale) {
    const half = RIVER.length / 2 - 6;
    for (const b of this.boats) {
      const p = b.grp.position;
      if (b.moored) {
        p.y = WATER_Y + 0.5 + Math.sin(t * 0.9 + b.phase) * 0.05;
        b.grp.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.024;
        b.grp.rotation.x = Math.sin(t * 0.55 + b.phase) * 0.013;
        b.colRef[0].set(p.x, p.y, p.z);
        b.colRef[1].set(p.x, p.y, p.z);
        b.colRef[2].set(p.x, p.y, p.z);
        continue;
      }
      b.t += dt * b.speed * speedScale * b.dir;
      if (b.t > 1) b.t -= 1;
      if (b.t < 0) b.t += 1;
      const z = (b.t - 0.5) * 2 * half;
      const sway = Math.sin(t * 0.35 + b.phase) * 1.1;
      p.set(b.lane + sway * 0.22, WATER_Y + 0.34 + Math.sin(t * 1.4 + b.phase) * 0.07, z);
      b.grp.rotation.y = (b.dir > 0 ? Math.PI : 0) + sway * 0.05;
      b.grp.rotation.z = Math.sin(t * 1.25 + b.phase) * 0.03;
      b.grp.rotation.x = Math.sin(t * 0.9 + b.phase * 1.7) * 0.018;
      b.foam.scale.set(1, 0.45 + speedScale * 0.7, 1);
      b.colRef[0].set(p.x, p.y, p.z - 5.6 * b.dir);
      b.colRef[1].set(p.x, p.y, p.z);
      b.colRef[2].set(p.x, p.y, p.z + 5.4 * b.dir);
      this.columns.setPos(b.colBow, b.colRef[0]);
      this.columns.setPos(b.colCabin, b.colRef[1]);
      this.columns.setPos(b.colStern, b.colRef[2]);
    }
  }
}

/* ------------------------------------------------------------------ 人流 */
/** 秦淮两岸的行走路径；桥上的走法由 bridgeAt(u, off) 给出一段弧线 */
const QUAY_PATHS = [
  { a: [-25.6, Q + 0.5, -70], b: [-25.6, Q + 0.5, 70] },
  { a: [-24.2, Q + 0.5, 68], b: [-26.8, Q + 0.5, -68] },
  { a: [-20.8, Q + 0.6, -86], b: [-20.8, Q + 0.6, 86] },
  { a: [20.8, Q + 0.6, 86], b: [20.8, Q + 0.6, -86] },
  { a: [26.0, Q + 0.6, -26], b: [26.0, Q + 0.6, 26] },
  { a: [34.5, Q + 0.6, 12], b: [34.5, Q + 0.6, -12] },
  { a: [45.0, Q + 3.2, -8], b: [45.0, Q + 3.2, 8] },
  { a: [-19.6, Q + 0.6, -46], b: [-19.6, Q + 0.6, -90] },
];
/** 文德桥：桥面在 z=0 横跨河道，中线最高 */
function quayBridgeAt(u, off) {
  const x = Math.sign(u - 0.5 || 1) * (6 + Math.abs(u - 0.5) * 26);
  const s = 19;
  return { x, y: Q + 0.6 + 5.3 * Math.max(0, 1 - (x / s) ** 2) ** 0.86 - 0.5, z: off * 1.4, heading: x > 0 ? Math.PI : 0 };
}

export class Crowd {
  constructor(scene, { paths = QUAY_PATHS, bridgeAt = quayBridgeAt, bridgeEvery = 24, lanternRate = 0.4 } = {}) {
    this.paths = paths;
    this.bridgeAt = bridgeAt;
    this.bridgeEvery = bridgeEvery;
    this.lanternRate = lanternRate;
    this.max = 320;
    this.agents = [];
    this.mesh = new THREE.InstancedMesh(
      figureGeo(1.0),
      new THREE.MeshStandardMaterial({ color: 0x161a25, roughness: 0.92 }),
      this.max,
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.lanternMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,180,110', 0.08) } },
      vertexShader: `attribute float aPhase; uniform float uTime; varying float vA;
        void main(){ vA = 0.72+0.28*sin(uTime*3.4+aPhase*6.28);
          vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_PointSize = min(26.0,100.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t=texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.6,0.28)*2.0, t.a*vA*0.7); }`,
    });
    this.lPos = new Float32Array(this.max * 3);
    this.lPhase = new Float32Array(this.max);
    this.lanternGeo = new THREE.BufferGeometry();
    this.lanternGeo.setAttribute('position', new THREE.BufferAttribute(this.lPos, 3));
    this.lanternGeo.setAttribute('aPhase', new THREE.BufferAttribute(this.lPhase, 1));
    this.lanterns = new THREE.Points(this.lanternGeo, this.lanternMat);
    this.lanterns.frustumCulled = false;
    this.lanterns.renderOrder = 5;
    scene.add(this.lanterns);
    this.d = new THREE.Object3D();
    this.build();
  }
  build() {
    const paths = this.paths;
    const lens = paths.map((p) => Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]));
    const total = lens.reduce((a, b) => a + b, 0);
    const cum = [];
    lens.reduce((acc, l) => { const v = acc + l / total; cum.push(v); return v; }, 0);
    for (let i = 0; i < this.max; i++) {
      const r0 = rand();
      const path = paths[cum.findIndex((c) => r0 <= c)] || paths[0];
      this.agents.push({
        path,
        t: rand(),
        sp: rr(0.005, 0.015) * (rand() > 0.5 ? 1 : -1),
        off: rr(-1.4, 1.4),
        phase: rand() * 6.28,
        scale: rr(0.88, 1.1),
        onBridge: i % this.bridgeEvery === 0,
        lamp: rand() < this.lanternRate,
        dir: rand() > 0.5 ? 1 : -1,
      });
    }
  }
  update(t, dt, count, eye) {
    const n = Math.max(0, Math.min(this.max, count | 0));
    const d = this.d;
    let li = 0;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      a.t += dt * a.sp;
      if (a.t > 1) a.t -= 1;
      if (a.t < 0) a.t += 1;
      const { path } = a;
      const pz = path.b[2] - path.a[2], px = path.b[0] - path.a[0];
      const len = Math.hypot(px, pz) || 1;
      let x = path.a[0] + px * a.t, z = path.a[2] + pz * a.t, y = path.a[1] + (path.b[1] - path.a[1]) * a.t;
      let heading = Math.atan2(pz, px) * a.dir;
      if (a.onBridge) {
        const p = this.bridgeAt(a.t, a.off);
        x = p.x; y = p.y; z = p.z;
        heading = p.heading;
      } else {
        x += (-pz / len) * a.off;
        z += (px / len) * a.off;
        heading = Math.atan2(pz * a.dir, px * a.dir);
      }
      const stride = Math.sin(t * 5.4 + a.phase);
      const near = eye && Math.hypot(x - eye.x, y - eye.y, z - eye.z) < 8.0;
      d.position.set(x, y + Math.abs(stride) * 0.05, z);
      d.rotation.set(0, -heading + Math.PI / 2, stride * 0.035);
      d.scale.setScalar(near ? 0 : a.scale);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      if (a.lamp && !near && li < this.max) {
        this.lPos.set([x + 0.34, y + 1.5 + stride * 0.05, z], li * 3);
        this.lPhase[li] = a.phase;
        li++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lanternGeo.setDrawRange(0, li);
    this.lanternGeo.attributes.position.needsUpdate = true;
    this.lanternGeo.attributes.aPhase.needsUpdate = true;
    this.lanternMat.uniforms.uTime.value = t;
  }
}

/* ------------------------------------------------------------------ 河灯 */
function lotusLanterns(scene) {
  const N = 72;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
  const cs = [new THREE.Color('#ffd28f'), new THREE.Color('#ff8f6a'), new THREE.Color('#9ff0d6')];
  for (let i = 0; i < N; i++) {
    pos.set([rr(-HW + 2.5, HW - 2.5), WATER_Y + 0.12, rr(-RIVER.length / 2, RIVER.length / 2)], i * 3);
    const cc = cs[(rand() * 3) | 0];
    col.set([cc.r * 2.4, cc.g * 2.4, cc.b * 2.4], i * 3);
    size[i] = rr(0.8, 1.5);
    ph[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,200,140', 0.1) }, uFlow: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
      uniform float uTime; uniform float uFlow; varying vec3 vC; varying float vA;
      void main(){ vec3 p = position;
        p.z = mod(p.z + ${(RIVER.length / 2).toFixed(1)} + uTime*0.8*uFlow, ${RIVER.length.toFixed(1)}) - ${(RIVER.length / 2).toFixed(1)};
        p.x += sin(uTime*0.5+aPhase*6.28)*0.5;
        p.y += sin(uTime*1.6+aPhase*6.28)*0.06;
        vC = aCol; vA = 0.7+0.3*sin(uTime*2.2+aPhase*6.28);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = min(30.0,aSize*200.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.75); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, uni: m.uniforms, attr: g.attributes.position };
}

/* ------------------------------------------------------------------ assembly */
export function buildProps(scene, columns, anchors) {
  const field = new LanternField(scene, columns);

  anchors.eaves.forEach((p, i) => field.add(p, {
    color: ['#ffbe72', '#ff9a63', '#ffd7a0', '#ff7a52'][i % 4],
    size: rr(0.85, 1.15), column: i % 3 === 0, columnDepth: 7,
  }));
  anchors.lampPosts.forEach((p) => field.add(p, { color: '#ff9d5e', size: 1.1, shape: 'hex', column: true, columnDepth: 9 }));
  anchors.windowGlow.forEach((p) => field.add(p, { color: '#ffdca8', size: 0.8, shape: 'hex' }));
  anchors.bridgeLamps.forEach((p) => field.add(p, { color: '#ffe0b0', size: 1.05, shape: 'hex', column: true, columnDepth: 8 }));
  anchors.archLamps.forEach((p, i) => field.add(p, { color: '#ffb066', size: 0.8, column: i % 4 === 0, columnDepth: 6 }));
  anchors.templeLamps.forEach((p, i) => field.add(p, {
    color: i % 2 ? '#ff8f5e' : '#ffd28f', size: 1.25, shape: 'hex', column: true, columnDepth: 11,
  }));
  anchors.templeWindows.forEach((p) => field.add(p, { color: '#ffe3b4', size: 0.75, shape: 'hex' }));
  anchors.courtyardLamps.forEach((p) => field.add(p, { color: '#ffbe72', size: 1.0 }));
  anchors.paifangLamps.forEach((p) => field.add(p, { color: '#ffd08a', size: 1.2, column: true, columnDepth: 10 }));
  anchors.zhaobiLamps.forEach((p) => field.add(p, { color: '#ff9d5e', size: 0.95 }));
  anchors.gongyuanLamps.forEach((p) => field.add(p, { color: '#c9e8a0', size: 1.0, column: true, columnDepth: 7 }));
  anchors.gongyuanWindows.forEach((p) => field.add(p, { color: '#ffe3b4', size: 0.7, shape: 'hex' }));
  anchors.ferryLamps.forEach((p) => field.add(p, { color: '#ffcf8a', size: 1.1, column: true, columnDepth: 8 }));
  anchors.shopLamps.forEach((p) => field.add(p, { color: WARM(), size: 0.9 }));
  anchors.gate.forEach((p) => field.add(p, { color: '#ffe0a8', size: 1.2, shape: 'hex', column: true, columnDepth: 9 }));
  field.build();

  return {
    field,
    strings: overheadStrings(scene, anchors, columns),
    fleet: new Fleet(scene, columns, { count: 7 }),
    crowd: new Crowd(scene),
    lotus: lotusLanterns(scene),
  };
}
