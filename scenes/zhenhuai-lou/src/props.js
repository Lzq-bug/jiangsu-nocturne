import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, stringPath, figureGeo, loftHull, box, mesh, PAL } from './kit.js';
import { CANAL, BERTHS, TOWER } from './data.js';
import { WATER_Y } from './water.js';
import * as T from './textures.js';

const Q = CANAL.deckY, HW = CANAL.halfWidth;
const TOP_Y = Q + TOWER.baseH;
/** 街上与楼上的火：市灯偏橙，台顶的更灯偏红 */
const FIRE = () => (rand() > 0.74 ? '#ff7f3a' : rand() > 0.34 ? '#ffb367' : '#ffd9a4');

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

/** 场景里所有固定灯位，密度滑块只熄掉排在后面的那批 */
class LanternField {
  constructor(scene, columns) {
    this.entries = [];
    this.columns = columns;
    const paper = T.lanternPaper();
    const body = () => new THREE.MeshBasicMaterial({ map: paper, toneMapped: false, fog: true });
    this.meshes = {
      round: new InstancedGlow(roundGeo, body(), 520),
      hex: new InstancedGlow(hexGeo, body(), 520),
      cap: new InstancedGlow(capGeo, glow('#d8ab63', 0.7), 1040),
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
          gl_PointSize = min(34.0, aSize * 220.0 / max(1.0,-mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.12); }`,
    });
    this.haloGeo = new THREE.BufferGeometry();
    this.halo = new THREE.Points(this.haloGeo, this.haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    scene.add(this.halo);
  }
  add(p, { color = FIRE(), size = 1, shape = 'auto', column = false, columnDepth = 8, columnWidth = 1.0 } = {}) {
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
      const bright = 1.0 + rand() * 0.55;
      tmp.copy(e.color).multiplyScalar(bright);
      if (e.shape === 'round') { this.meshes.round.put(r, e.p, e.size, rand() * 3, tmp); this.prefix.round.push(i); r++; }
      else { this.meshes.hex.put(h, e.p, e.size, rand() * 3, tmp); this.prefix.hex.push(i); h++; }
      tmp.copy(e.color).multiplyScalar(0.55);
      this.meshes.cap.put(c++, e.p.clone().setY(e.p.y + e.size * 0.44), e.size * 0.8, 0, tmp);
      pos[3 * i] = e.p.x; pos[3 * i + 1] = e.p.y; pos[3 * i + 2] = e.p.z;
      tmp.copy(e.color).multiplyScalar(bright);
      col[3 * i] = tmp.r; col[3 * i + 1] = tmp.g; col[3 * i + 2] = tmp.b;
      size[i] = e.size * 2.5;
      phase[i] = rand();
      if (e.column) this.colOf[i] = this.columns.add(e.p, e.color, e.columnWidth * e.size, e.columnDepth, 1.1);
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
  setDensity(fraction) {
    const lit = Math.max(0, Math.min(this.total, Math.round(Math.min(1, fraction) * this.total)));
    this.meshes.round.count = LanternField.litCount(this.prefix.round, lit);
    this.meshes.hex.count = LanternField.litCount(this.prefix.hex, lit);
    this.meshes.cap.count = this.meshes.round.count + this.meshes.hex.count;
    this.haloGeo.setDrawRange(0, lit);
    this.haloMat.uniforms.uOn.value = lit > 0 ? 1 : 0;
    this.entries.forEach((e, i) => {
      if (this.colOf[i] !== undefined) this.columns.setOn(this.colOf[i], i < lit);
    });
    this.litCount = lit;
  }
  update(t) { this.haloMat.uniforms.uTime.value = t; }
}

/* ------------------------------------------------------------------ 跨渠灯串 */
function overheadStrings(scene, anchors, columns) {
  const grp = new THREE.Group();
  const linePos = [], bulbPos = [], bulbCol = [], bulbSize = [], bulbPhase = [];
  const warm = new THREE.Color('#ffcf8a'), red = new THREE.Color('#ff7f5e'), jade = new THREE.Color('#9fe8d8');
  anchors.stringEnds.forEach((pair, k) => {
    const pts = stringPath(pair[0], pair[1], 2.1 + rand() * 0.9, 30);
    for (let i = 0; i < pts.length - 1; i++) {
      linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    for (let i = 2; i < pts.length - 1; i += 2) {
      const p = pts[i];
      bulbPos.push(p.x, p.y - 0.28, p.z);
      const c = (i + k) % 9 === 0 ? jade : (i + k) % 3 === 0 ? red : warm;
      bulbCol.push(c.r * 2.0, c.g * 2.0, c.b * 2.0);
      bulbSize.push(1.3 + rand() * 0.7);
      bulbPhase.push(rand());
    }
    const mid = pts[Math.floor(pts.length / 2)];
    columns.add(mid.clone().setY(mid.y - 1.3), '#ffb877', 2.2, 11, 0.7);
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
        gl_PointSize = min(40.0, aSize*250.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.32); }`,
  });
  const bulbs = new THREE.Points(bg, bm);
  bulbs.frustumCulled = false;
  bulbs.renderOrder = 5;
  grp.add(bulbs);
  scene.add(grp);
  return { grp, uni: bm.uniforms };
}

/* ------------------------------------------------------------------ 文渠小舟 */
const GEO = {};
function hullGeo() {
  if (GEO.hull) return GEO.hull;
  const stations = [-4.6, -3.4, -1.3, 1.3, 3.4, 4.6];
  const profile = (z) => {
    const t = Math.abs(z) / 4.6;
    const b = 0.86 * Math.pow(Math.max(0.02, 1 - t * t * 0.94), 0.6);
    return [[-b, 0.44], [-b * 0.9, -0.12], [-b * 0.34, -0.42], [b * 0.34, -0.42], [b * 0.9, -0.12], [b, 0.44], [b * 0.5, 0.58], [-b * 0.5, 0.58]];
  };
  const parts = [loftHull(profile, stations, false)];
  parts.push(box(1.4, 0.13, 8.8, 0, 0.62, 0));
  const bow = new THREE.ConeGeometry(0.36, 1.4, 6);
  bow.rotateX(-Math.PI / 2);
  bow.translate(0, 0.36, -5.3);
  parts.push(bow);
  parts.push(box(1.24, 0.62, 0.7, 0, 0.5, 4.9));
  GEO.hull = mergeGeometries(parts);
  return GEO.hull;
}
function canopyGeo() {
  if (GEO.canopy) return GEO.canopy;
  const parts = [];
  for (const [z, len, r] of [[-2.1, 2.6, 0.72], [0.6, 2.9, 0.8], [2.8, 1.9, 0.66]]) {
    const arc = new THREE.CylinderGeometry(r, r, len, 10, 1, true, 0, Math.PI);
    arc.rotateX(Math.PI / 2);
    arc.translate(0, 0.6, z);
    parts.push(arc);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.TorusGeometry(r + 0.02, 0.026, 4, 12, Math.PI);
      rib.translate(0, 0.6, z - len / 2 + (len * i) / 3);
      parts.push(rib);
    }
  }
  parts.push(box(1.2, 0.1, 0.44, 0, 1.42, 0.6));
  GEO.canopy = mergeGeometries(parts);
  return GEO.canopy;
}
function boatmanGeo() {
  if (GEO.boatman) return GEO.boatman;
  const parts = [];
  const body = new THREE.CylinderGeometry(0.14, 0.2, 0.86, 7);
  body.translate(0, 0.52, 0);
  parts.push(body);
  const head = new THREE.SphereGeometry(0.12, 8, 6);
  head.translate(0, 1.06, 0);
  parts.push(head);
  const hat = new THREE.ConeGeometry(0.28, 0.15, 10);
  hat.translate(0, 1.18, 0);
  parts.push(hat);
  const arm = new THREE.CylinderGeometry(0.055, 0.055, 0.52, 5);
  arm.rotateZ(0.3);
  arm.translate(0.2, 0.74, 0);
  parts.push(arm);
  GEO.boatman = mergeGeometries(parts);
  return GEO.boatman;
}

class Fleet {
  constructor(scene, columns, { moving = 2 } = {}) {
    this.columns = columns;
    this.boats = [];
    this.fires = [];
    BERTHS.forEach(([x, z], i) => {
      const b = this.makeBoat(i, i === 0);
      b.grp.position.set(x, WATER_Y + 0.36, z);
      b.grp.rotation.y = i === 1 ? 0.24 : -0.14;
      b.moored = true;
      b.phase = rand() * 6.28;
      this.boats.push(b);
      scene.add(b.grp);
    });
    for (let i = 0; i < moving; i++) {
      const b = this.makeBoat(50 + i, false);
      b.lane = 3.2 + (i % 2) * 2.2 + rr(-0.4, 0.4);
      b.t = rand();
      b.dir = i % 2 ? 1 : -1;
      b.speed = rr(0.0038, 0.0066);
      b.phase = rand() * 6.28;
      this.boats.push(b);
      scene.add(b.grp);
    }
  }
  makeBoat(id, flagship) {
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo(), M.woodDark);
    hull.castShadow = true;
    const canopy = new THREE.Mesh(canopyGeo(), new THREE.MeshStandardMaterial({ map: T.wupengWeave(), color: 0x5a574e, roughness: 0.72 }));
    canopy.castShadow = true;
    canopy.position.y = 0.66;
    grp.add(hull, canopy);
    const cabin = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.74), M.lattice);
    cabin.position.set(0, 1.16, -3.4);
    grp.add(cabin);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.6), M.lattice);
      w.position.set(s * 0.7, 1.12, -2.0);
      w.rotation.y = s * Math.PI / 2;
      grp.add(w);
    }
    // 船头一盏篙灯，船尾一堆灶火：灶火会被鼓压一口
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(flagship ? '#ffcf94' : '#ffb367').multiplyScalar(1.12), fog: true });
    lampMat.toneMapped = false;
    const lamp = new THREE.Mesh(roundGeo, lampMat);
    lamp.scale.setScalar(0.7);
    lamp.position.set(0.42, 1.44, -4.4);
    grp.add(lamp, mesh(box(0.05, 0.76, 0.05, 0.42, 1.84, -4.4), M.ink));
    const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8b45').multiplyScalar(1.5), fog: true });
    fireMat.toneMapped = false;
    const fire = new THREE.Mesh(hexGeo, fireMat);
    fire.scale.setScalar(0.5);
    fire.position.set(-0.3, 0.9, 3.9);
    grp.add(fire, mesh(box(0.6, 0.26, 0.6, -0.3, 0.74, 3.9), M.ink));
    this.fires.push({
      mat: fireMat, lampMat,
      base: new THREE.Color('#ff8b45').multiplyScalar(1.5),
      baseLamp: new THREE.Color(flagship ? '#ffcf94' : '#ffb367').multiplyScalar(1.12),
    });

    const boatman = new THREE.Mesh(boatmanGeo(), M.ink);
    boatman.position.set(0.54, 0.68, 4.2);
    const oar = new THREE.Mesh(box(0.1, 0.1, 3.0, 0.28, 0.94, 5.5), M.beam);
    oar.rotation.x = 0.34;
    grp.add(boatman, oar);
    if (flagship) {
      const mat = new THREE.MeshBasicMaterial({ map: T.banner('渔'), transparent: true, side: THREE.DoubleSide, alphaTest: 0.42, fog: true });
      mat.toneMapped = false;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.15), mat);
      flag.position.set(-0.7, 1.34, -2.8);
      flag.rotation.y = -0.45;
      grp.add(flag, mesh(box(0.05, 0.05, 0.8, -0.35, 1.8, -2.8), M.woodDark));
    }
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 5.6), new THREE.MeshBasicMaterial({
      map: T.softGlow('205,225,250', 0.15), transparent: true, opacity: 0.11,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, WATER_Y + 0.07, 5.2);
    grp.add(wake);

    const v = new THREE.Vector3();
    return {
      grp, wake,
      colBow: this.columns.add(v.set(0, 0, 0), flagship ? '#ffcf94' : '#ffb367', 1.0, 5.5, 1.0),
      colFire: this.columns.add(v.set(0, 0, 0), '#ff8b45', 1.3, 7.5, 1.1),
      colRef: [new THREE.Vector3(), new THREE.Vector3()],
    };
  }
  moored(i = 0) {
    const b = this.boats.filter((x) => x.moored)[i];
    return b ? b.grp : null;
  }
  /** 鼓一响，火苗矮一矮再弹回来 */
  flare(strength) {
    for (const f of this.fires) f.kick = Math.max(f.kick || 0, strength);
  }
  update(t, dt, speedScale) {
    const half = CANAL.length / 2 - 10;
    for (const b of this.boats) {
      const p = b.grp.position;
      if (b.moored) {
        p.y = WATER_Y + 0.36 + Math.sin(t * 0.85 + b.phase) * 0.05;
        b.grp.rotation.z = Math.sin(t * 0.66 + b.phase) * 0.026;
        b.grp.rotation.x = Math.sin(t * 0.5 + b.phase) * 0.012;
        b.colRef[0].set(p.x, p.y, p.z - 4.4);
        b.colRef[1].set(p.x, p.y, p.z + 3.9);
      } else {
        b.t += dt * b.speed * speedScale * b.dir;
        if (b.t > 1) b.t -= 1;
        if (b.t < 0) b.t += 1;
        const z = (b.t - 0.5) * 2 * half;
        const sway = Math.sin(t * 0.32 + b.phase) * 0.9;
        p.set(b.lane + sway * 0.2, WATER_Y + 0.3 + Math.sin(t * 1.3 + b.phase) * 0.06, z);
        b.grp.rotation.y = (b.dir > 0 ? Math.PI : 0) + sway * 0.05;
        b.grp.rotation.z = Math.sin(t * 1.2 + b.phase) * 0.028;
        b.grp.rotation.x = Math.sin(t * 0.85 + b.phase * 1.7) * 0.016;
        b.wake.scale.set(1, 0.4 + speedScale * 0.6, 1);
        b.colRef[0].set(p.x, p.y, p.z - 4.2 * b.dir);
        b.colRef[1].set(p.x, p.y, p.z + 3.9 * b.dir);
      }
      this.columns.setPos(b.colBow, b.colRef[0]);
      this.columns.setPos(b.colFire, b.colRef[1]);
    }
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      const flick = 0.86 + 0.14 * Math.sin(t * 3.4 + i * 1.7);
      let k = 1;
      if (f.kick) {
        f.kick = Math.max(0, f.kick - dt * 1.4);
        k = 1 - 0.42 * f.kick;
      }
      f.mat.color.copy(f.base).multiplyScalar(flick * k);
      f.lampMat.color.copy(f.baseLamp).multiplyScalar((0.92 + 0.08 * Math.sin(t * 2.2 + i)) * (0.7 + 0.3 * k));
    }
  }
}

/* ------------------------------------------------------------------ 街上的人与更夫 */
class Crowd {
  constructor(scene, bridges) {
    this.max = 200;
    this.agents = [];
    this.bridgeArcs = bridges.map((br) => ({
      z: br.at, half: br.half, span: br.span,
      y: (x) => br.deckY(x) - 0.55,
    }));
    this.mesh = new THREE.InstancedMesh(
      figureGeo(1.0),
      new THREE.MeshStandardMaterial({ color: 0x1b2131, roughness: 0.92 }),
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
          gl_PointSize = min(24.0,96.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t=texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.62,0.3)*1.9, t.a*vA*0.66); }`,
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
    // 楼前街、台顶、大街、河房檐下、署前，各走各的一段再折回
    const paths = [
      { a: [12.6, Q + 0.05, -30], b: [12.6, Q + 0.05, 30] },
      { a: [13.4, Q + 0.05, -9], b: [13.4, Q + 0.05, 8] },
      { a: [-20.0, Q + 0.05, 34], b: [-20.2, Q + 0.05, -30] },
      { a: [-14.6, Q + 0.05, 26], b: [-14.4, Q + 0.05, -26] },
      { a: [-23.4, Q + 0.05, -22], b: [-23.2, Q + 0.05, 24] },
      { a: [43.0, Q + 0.05, 20], b: [43.2, Q + 0.05, -18] },
      { a: [18.2, TOP_Y + 0.3, -6.4], b: [18.2, TOP_Y + 0.3, 6.4] },
    ];
    const lens = paths.map((p) => Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2]));
    const total = lens.reduce((a, b) => a + b, 0);
    const cum = [];
    lens.reduce((acc, l) => { const v = acc + l / total; cum.push(v); return v; }, 0);
    for (let i = 0; i < this.max; i++) {
      const r0 = rand();
      const path = paths[cum.findIndex((c) => r0 <= c)] || paths[0];
      const onTerrace = path.a[1] > TOP_Y;
      this.agents.push({
        path,
        t: rand(),
        sp: rr(0.0045, 0.013) * (rand() > 0.5 ? 1 : -1),
        off: rr(-1.2, 1.2),
        phase: rand() * 6.28,
        scale: rr(0.86, 1.08),
        onBridge: i % 17 === 0 ? 0 : -1,
        lamp: onTerrace ? true : rand() > 0.7,
        // 台顶那位提更灯的是打更的，走得更慢、灯也更亮
        watchman: onTerrace && i % 3 === 0,
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
      a.t += dt * a.sp * (a.watchman ? 0.55 : 1);
      if (a.t > 1) a.t -= 1;
      if (a.t < 0) a.t += 1;
      const { path } = a;
      const pz = path.b[2] - path.a[2], px = path.b[0] - path.a[0];
      const len = Math.hypot(px, pz) || 1;
      let x = path.a[0] + px * a.t, z = path.a[2] + pz * a.t;
      let y = path.a[1] + (path.b[1] - path.a[1]) * a.t;
      let heading;
      const br = a.onBridge >= 0 ? this.bridgeArcs[a.onBridge] : null;
      if (br) {
        x = Math.sign(a.t - 0.5 || 1) * (4 + Math.abs(a.t - 0.5) * (br.span - 4));
        x = Math.max(-br.span, Math.min(br.span, x));
        y = br.y(x);
        z = br.z + a.off * (br.half - 0.5);
        heading = x > 0 ? Math.PI : 0;
      } else {
        x += (-pz / len) * a.off;
        z += (px / len) * a.off;
        heading = Math.atan2(pz * a.dir, px * a.dir);
      }
      const stride = Math.sin(t * 5.4 + a.phase);
      const near = eye && Math.hypot(x - eye.x, y - eye.y, z - eye.z) < 8.5;
      d.position.set(x, y + Math.abs(stride) * 0.05, z);
      d.rotation.set(0, -heading + Math.PI / 2, stride * 0.035);
      d.scale.setScalar(near ? 0 : a.scale);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      if (a.lamp && !near && li < this.max) {
        this.lPos.set([x + 0.32, y + 1.44 + stride * 0.05, z], li * 3);
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

/* ------------------------------------------------------------------ 流萤 */
const FLY_MAX = 240;
/**
 * 六月淮畔的萤火虫：只贴着苇岸与城脚走，比落叶轻、比星星乱。
 * 鼓声把它们震散一片，是夜里唯一会跟着声音跑的东西。
 */
function fireflies(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(FLY_MAX * 3);
  const flies = [];
  for (let i = 0; i < FLY_MAX; i++) {
    // 一渠两岸各一条带子，渠心与屋里没有萤
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * rr(HW - 1.6, HW + 9);
    flies.push({
      x, y: rr(0.4, 3.2), z: rr(-70, 70),
      ph: rand() * 6.28, sp: rr(0.22, 0.62), sway: rr(0.4, 1.3),
      scatter: 0,
    });
    pos[i * 3] = x; pos[i * 3 + 1] = flies[i].y; pos[i * 3 + 2] = flies[i].z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const phase = new Float32Array(FLY_MAX);
  flies.forEach((f, i) => { phase[i] = f.ph; });
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('214,255,176', 0.18) } },
    vertexShader: `attribute float aPhase; uniform float uTime;
      varying float vA;
      void main(){
        float blink = pow(0.5+0.5*sin(uTime*2.3+aPhase*3.7), 2.2);
        vA = blink;
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = min(5.5, (1.5+blink*2.4)*120.0/max(1.0,-mv.z));
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.78,1.0,0.56)*1.15, t.a*vA*0.5); }`,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
  return {
    points: pts,
    /** 鼓一响，萤散一片 */
    scatter(x, z, strength) {
      for (const f of flies) {
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < 40) f.scatter = Math.max(f.scatter, strength * (1 - d / 40));
      }
    },
    update(t, dt, density, eye) {
      const n = Math.round(FLY_MAX * Math.min(1, density));
      const arr = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const f = flies[i];
        f.scatter = Math.max(0, f.scatter - dt * 0.6);
        f.x += Math.sin(t * f.sp + f.ph) * dt * (0.5 + f.scatter * 3.2);
        f.y += Math.cos(t * f.sp * 0.8 + f.ph * 1.7) * dt * (0.35 + f.scatter * 1.6);
        f.z += Math.sin(t * f.sp * 0.6 + f.ph * 0.6) * dt * (0.4 + f.scatter * 2.2);
        if (f.y < 0.25) f.y = 0.25;
        if (f.y > 4.2) f.y = 4.2;
        if (eye && Math.hypot(f.x - eye.x, f.y - eye.y, f.z - eye.z) < 1.4) {
          f.x += (Math.random() - 0.5) * 2.2;
          f.z += (Math.random() - 0.5) * 2.2;
        }
        arr[i * 3] = f.x; arr[i * 3 + 1] = f.y; arr[i * 3 + 2] = f.z;
      }
      pts.geometry.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true;
      pts.material.uniforms.uTime.value = t;
    },
  };
}

/* ------------------------------------------------------------------ 装配 */
export function buildProps(scene, columns, anchors, bridges) {
  const field = new LanternField(scene, columns);

  // 楼是主角：明间檐下与匾上的灯最亮，也给最长的水柱。
  // 尺寸一律压到一米以下——这些球是"灯"，不是"月亮"，近看会糊满半张画面。
  anchors.towerLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ff9f66' : '#ffd2a0', size: 0.86, shape: 'hex', column: true, columnDepth: 10 }));
  anchors.signLamps.forEach((p) => field.add(p, { color: '#ffe0b0', size: 0.9, shape: 'hex', column: true, columnDepth: 9 }));
  anchors.latticeLamps.forEach((p) => field.add(p, { color: '#ffdcab', size: 0.5 }));
  anchors.rafterLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ffb877' : '#ffd9a8', size: 0.62, column: i % 4 === 0, columnDepth: 7 }));
  anchors.drumLamps.forEach((p) => field.add(p, { color: '#ff8f5e', size: 0.8, shape: 'hex', column: true, columnDepth: 8 }));
  anchors.terraceLamps.forEach((p) => field.add(p, { color: '#ffbe72', size: 0.68, shape: 'hex' }));
  anchors.gateLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ffab63' : '#ffd2a0', size: 0.56, shape: 'hex' }));
  anchors.bridgeLamps.forEach((p) => field.add(p, { color: '#ffe0b0', size: 0.66, shape: 'hex', column: true, columnDepth: 7 }));
  anchors.archLamps.forEach((p, i) => field.add(p, { color: '#ffb066', size: 0.5, column: i % 3 === 0, columnDepth: 5 }));
  anchors.shopLamps.forEach((p) => field.add(p, { color: FIRE(), size: 0.56 }));
  anchors.houseEaves.forEach((p, i) => field.add(p, { color: i % 3 === 0 ? '#ff7f4a' : '#ffbe72', size: 0.52, column: i % 5 === 0, columnDepth: 6 }));
  anchors.windowGlow.forEach((p) => field.add(p, { color: '#ffdcae', size: 0.42, shape: 'hex' }));
  anchors.streetLamps.forEach((p) => field.add(p, { color: '#ff9d5e', size: 0.64, shape: 'hex', column: true, columnDepth: 7 }));
  anchors.courtLamps.forEach((p) => field.add(p, { color: '#ffca8a', size: 0.56 }));
  anchors.yamenLamps.forEach((p) => field.add(p, { color: '#ff7a4e', size: 0.72, shape: 'hex', column: true, columnDepth: 8 }));
  field.build();

  return {
    field,
    strings: overheadStrings(scene, anchors, columns),
    fleet: new Fleet(scene, columns, { moving: 2 }),
    crowd: new Crowd(scene, bridges),
    flies: fireflies(scene),
  };
}

export { PAL };
