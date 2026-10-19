import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, stringPath, figureGeo, loftHull, box, mesh, PAL } from './kit.js';
import { CANAL, BERTHS } from './data.js';
import { WATER_Y } from './water.js';
import * as T from './textures.js';

const Q = CANAL.deckY, HW = CANAL.halfWidth;
/** 夜里的火都是渔火与寺灯，色温比秦淮的灯会低一档 */
const FIRE = () => (rand() > 0.72 ? '#ff7f3a' : rand() > 0.32 ? '#ffb367' : '#ffd9a4');

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
      round: new InstancedGlow(roundGeo, body(), 620),
      hex: new InstancedGlow(hexGeo, body(), 620),
      cap: new InstancedGlow(capGeo, glow('#d8ab63', 0.7), 1240),
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
          gl_PointSize = min(54.0, aSize * 300.0 / max(1.0,-mv.z));
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

/* ------------------------------------------------------------------ 跨河灯串 */
function overheadStrings(scene, anchors, columns) {
  const grp = new THREE.Group();
  const linePos = [], bulbPos = [], bulbCol = [], bulbSize = [], bulbPhase = [];
  const warm = new THREE.Color('#ffcf8a'), red = new THREE.Color('#ff7f5e'), frost = new THREE.Color('#a9d8ea');
  anchors.stringEnds.forEach((pair, k) => {
    const pts = stringPath(pair[0], pair[1], 2.2 + rand() * 1.0, 30);
    for (let i = 0; i < pts.length - 1; i++) {
      linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    for (let i = 2; i < pts.length - 1; i += 2) {
      const p = pts[i];
      bulbPos.push(p.x, p.y - 0.28, p.z);
      const c = (i + k) % 9 === 0 ? frost : (i + k) % 3 === 0 ? red : warm;
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

/* ------------------------------------------------------------------ 乌篷船 */
const GEO = {};
function hullGeo() {
  if (GEO.hull) return GEO.hull;
  const stations = [-5.6, -4.2, -1.6, 1.6, 4.2, 5.6];
  const profile = (z) => {
    const t = Math.abs(z) / 5.6;
    const b = 1.02 * Math.pow(Math.max(0.02, 1 - t * t * 0.94), 0.6);
    return [[-b, 0.5], [-b * 0.9, -0.14], [-b * 0.36, -0.5], [b * 0.36, -0.5], [b * 0.9, -0.14], [b, 0.5], [b * 0.5, 0.66], [-b * 0.5, 0.66]];
  };
  const parts = [loftHull(profile, stations, false)];
  parts.push(box(1.7, 0.14, 10.8, 0, 0.7, 0));
  const bow = new THREE.ConeGeometry(0.42, 1.7, 6);
  bow.rotateX(-Math.PI / 2);
  bow.translate(0, 0.42, -6.4);
  parts.push(bow);
  parts.push(box(1.5, 0.72, 0.8, 0, 0.55, 5.9));
  GEO.hull = mergeGeometries(parts);
  return GEO.hull;
}
function canopyGeo() {
  if (GEO.canopy) return GEO.canopy;
  const parts = [];
  // 竹篷：三段半圆拱，前低后高，中间略鼓
  for (const [z, len, r] of [[-2.6, 3.0, 0.86], [0.4, 3.4, 0.94], [3.4, 2.2, 0.78]]) {
    const arc = new THREE.CylinderGeometry(r, r, len, 10, 1, true, 0, Math.PI);
    arc.rotateX(Math.PI / 2);
    arc.translate(0, 0.72, z);
    parts.push(arc);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.TorusGeometry(r + 0.02, 0.028, 4, 12, Math.PI);
      rib.translate(0, 0.72, z - len / 2 + (len * i) / 3);
      parts.push(rib);
    }
  }
  parts.push(box(1.5, 0.1, 0.5, 0, 1.62, 0.4));
  GEO.canopy = mergeGeometries(parts);
  return GEO.canopy;
}
function boatmanGeo() {
  if (GEO.boatman) return GEO.boatman;
  const parts = [];
  const body = new THREE.CylinderGeometry(0.15, 0.22, 0.92, 7);
  body.translate(0, 0.55, 0);
  parts.push(body);
  const head = new THREE.SphereGeometry(0.13, 8, 6);
  head.translate(0, 1.14, 0);
  parts.push(head);
  const hat = new THREE.ConeGeometry(0.3, 0.16, 10);
  hat.translate(0, 1.26, 0);
  parts.push(hat);
  const arm = new THREE.CylinderGeometry(0.06, 0.06, 0.56, 5);
  arm.rotateZ(0.3);
  arm.translate(0.22, 0.78, 0);
  parts.push(arm);
  GEO.boatman = mergeGeometries(parts);
  return GEO.boatman;
}

class Fleet {
  constructor(scene, columns, { moving = 3 } = {}) {
    this.columns = columns;
    this.boats = [];
    this.fires = [];
    BERTHS.forEach(([x, z], i) => {
      const b = this.makeBoat(i, i === 0);
      b.grp.position.set(x, WATER_Y + 0.42, z);
      b.grp.rotation.y = i === 1 ? 0.22 : -0.12 + i * 0.1;
      b.moored = true;
      b.phase = rand() * 6.28;
      this.boats.push(b);
      scene.add(b.grp);
    });
    for (let i = 0; i < moving; i++) {
      const b = this.makeBoat(50 + i, false);
      b.lane = 3.6 + (i % 2) * 2.4 + rr(-0.5, 0.5);
      b.t = rand();
      b.dir = i % 2 ? 1 : -1;
      b.speed = rr(0.0042, 0.0075);
      b.phase = rand() * 6.28;
      this.boats.push(b);
      scene.add(b.grp);
    }
  }
  makeBoat(id, flagship) {
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo(), M.woodDark);
    hull.castShadow = true;
    const canopyMat = new THREE.MeshStandardMaterial({ map: T.wupengWeave(), color: 0x5a574e, roughness: 0.72 });
    const canopy = new THREE.Mesh(canopyGeo(), canopyMat);
    canopy.castShadow = true;
    canopy.position.y = 0.78;
    grp.add(hull, canopy);
    // 船头的舱窗与门
    const cabin = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.85), M.lattice);
    cabin.position.set(0, 1.35, -4.15);
    grp.add(cabin);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), M.lattice);
      w.position.set(s * 0.82, 1.3, -2.4);
      w.rotation.y = s * Math.PI / 2;
      grp.add(w);
    }
    // 灯：船头一盏宫灯，船尾一堆渔火（渔火单独可被钟声压一压）
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(flagship ? '#ffcf94' : '#ffb367').multiplyScalar(1.12), fog: true });
    lampMat.toneMapped = false;
    const lamp = new THREE.Mesh(roundGeo, lampMat);
    lamp.scale.setScalar(0.78);
    lamp.position.set(0.5, 1.62, -5.35);
    grp.add(lamp);
    grp.add(mesh([box(0.05, 0.86, 0.05, 0.5, 2.05, -5.35)], M.ink));
    const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.fisherFire).multiplyScalar(1.55), fog: true });
    fireMat.toneMapped = false;
    const fire = new THREE.Mesh(hexGeo, fireMat);
    fire.scale.setScalar(0.56);
    fire.position.set(-0.35, 1.0, 4.6);
    grp.add(fire);
    const basket = mesh([box(0.7, 0.3, 0.7, -0.35, 0.82, 4.6), box(0.1, 0.5, 0.1, -0.35, 1.1, 4.9)], M.ink);
    grp.add(basket);
    this.fires.push({ mesh: fire, mat: fireMat, lamp, lampMat, base: new THREE.Color(PAL.fisherFire).multiplyScalar(1.55), baseLamp: new THREE.Color(flagship ? '#ffcf94' : '#ffb367').multiplyScalar(1.12) });

    const boatman = new THREE.Mesh(boatmanGeo(), M.ink);
    boatman.position.set(0.62, 0.78, 5.0);
    const steeringOar = new THREE.Mesh(box(0.1, 0.1, 3.4, 0.3, 1.05, 6.6), M.beam);
    steeringOar.rotation.x = 0.36;
    grp.add(boatman, steeringOar);
    if (flagship) {
      // 头船多一盏檐灯与一面小幌，让"客船"看得出是载人夜游的
      const lantern = new THREE.Mesh(hexGeo, lampMat);
      lantern.scale.setScalar(0.45);
      lantern.position.set(0, 2.05, 0.4);
      grp.add(lantern);
      const mat = new THREE.MeshBasicMaterial({ map: T.banner('舟'), transparent: true, side: THREE.DoubleSide, alphaTest: 0.42, fog: true });
      mat.toneMapped = false;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.25), mat);
      flag.position.set(-0.8, 1.55, -3.4);
      flag.rotation.y = -0.45;
      grp.add(flag);
      grp.add(mesh([box(0.05, 0.05, 0.9, -0.4, 2.05, -3.4)], M.woodDark));
    }
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 7), new THREE.MeshBasicMaterial({
      map: T.softGlow('205,225,250', 0.15), transparent: true, opacity: 0.11,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, WATER_Y + 0.07, 6.4);
    grp.add(wake);

    const v = new THREE.Vector3();
    return {
      grp, wake, lamp, fire,
      colBow: this.columns.add(v.set(0, 0, 0), flagship ? '#ffcf94' : '#ffb367', 1.1, 6, 1.0),
      colFire: this.columns.add(v.set(0, 0, 0), PAL.fisherFire, 1.5, 8.5, 1.15),
      colRef: [new THREE.Vector3(), new THREE.Vector3()],
    };
  }
  moored(i = 0) {
    const b = this.boats.filter((x) => x.moored)[i];
    return b ? b.grp : null;
  }
  /** 钟一响，火苗矮一矮再弹回来 */
  flare(strength) {
    for (const f of this.fires) f.kick = Math.max(f.kick || 0, strength);
  }
  update(t, dt, speedScale) {
    const half = CANAL.length / 2 - 8;
    for (const b of this.boats) {
      const p = b.grp.position;
      if (b.moored) {
        p.y = WATER_Y + 0.42 + Math.sin(t * 0.85 + b.phase) * 0.05;
        b.grp.rotation.z = Math.sin(t * 0.66 + b.phase) * 0.026;
        b.grp.rotation.x = Math.sin(t * 0.5 + b.phase) * 0.012;
        b.colRef[0].set(p.x, p.y, p.z - 5.3);
        b.colRef[1].set(p.x, p.y, p.z + 4.6);
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
        b.colRef[0].set(p.x, p.y, p.z - 5.0 * b.dir);
        b.colRef[1].set(p.x, p.y, p.z + 4.6 * b.dir);
      }
      this.columns.setPos(b.colBow, b.colRef[0]);
      this.columns.setPos(b.colFire, b.colRef[1]);
    }
    // 渔火的闪：常态是慢闪，被钟声 kick 之后短暂压暗再回弹
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

/* ------------------------------------------------------------------ 香客与舟子 */
class Crowd {
  constructor(scene, bridges) {
    this.max = 220;
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
    // 纤道、埠头、殿前、街巷、桥顶，人流各走各的一段再折回
    const paths = [
      { a: [-14.2, Q + 0.05, -34], b: [-14.2, Q + 0.05, 30] },
      { a: [-13.0, Q + 0.05, 26], b: [-13.4, Q + 0.05, -20] },
      { a: [-15.2, Q + 0.25, 14], b: [-14.4, Q + 0.25, 27] },
      { a: [-18.4, Q + 0.05, -1], b: [-21.0, Q + 0.05, -4] },
      { a: [-22.6, Q + 1.6, 4], b: [-22.6, Q + 1.6, -9] },
      { a: [12.4, Q + 0.05, 34], b: [12.4, Q + 0.05, -22] },
      { a: [13.8, Q + 0.05, -18], b: [14.4, Q + 0.05, 40] },
      { a: [22.4, Q + 0.3, 30], b: [22.0, Q + 0.3, -14] },
      { a: [16.0, Q + 0.05, 47], b: [17.2, Q + 0.05, 36] },
    ];
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
        sp: rr(0.005, 0.014) * (rand() > 0.5 ? 1 : -1),
        off: rr(-1.3, 1.3),
        phase: rand() * 6.28,
        scale: rr(0.86, 1.08),
        onBridge: i % 22 === 0 ? (i % 44 === 0 ? 0 : 1) : -1,
        lamp: rand() > 0.68,
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

/* ------------------------------------------------------------------ 落枫 */
const LEAF_MAX = 460;
function fallingLeaves(scene) {
  const geo = new THREE.PlaneGeometry(0.17, 0.17);
  const mat = new THREE.MeshBasicMaterial({
    map: T.mapleLeaf(), transparent: true, alphaTest: 0.38, side: THREE.DoubleSide, fog: true,
  });
  mat.toneMapped = false;
  const im = new THREE.InstancedMesh(geo, mat, LEAF_MAX);
  im.frustumCulled = false;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LEAF_MAX * 3).fill(1), 3);
  scene.add(im);
  const cols = ['#a13a28', '#c2632f', '#7c2a1e', '#d8802f'].map((c) => new THREE.Color(c));
  const d = new THREE.Object3D();
  const leaves = [];
  for (let i = 0; i < LEAF_MAX; i++) {
    leaves.push({
      x: rr(-HW - 12, HW + 16),
      y: rr(1.2, 12.5),
      z: rr(-72, 56),
      fall: rr(0.32, 0.95),
      spin: rr(1.2, 3.4) * (rand() > 0.5 ? 1 : -1),
      sway: rr(0.5, 1.7),
      ph: rand() * 6.28,
      scale: rr(0.7, 1.35),
      gust: 0,
    });
    const c = cols[(rand() * cols.length) | 0];
    im.setColorAt(i, c);
  }
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return {
    mesh: im,
    /** 钟声把树冠里的叶子震下来一片 */
    blow(x, z, strength) {
      for (const l of leaves) {
        const dd = Math.hypot(l.x - x, l.z - z);
        if (dd < 46 && l.y > 4) l.gust = Math.max(l.gust, strength * (1 - dd / 46));
      }
    },
    update(t, dt, density, eye) {
      const n = Math.round(LEAF_MAX * Math.min(1, density));
      for (let i = 0; i < n; i++) {
        const l = leaves[i];
        l.y -= dt * l.fall * (1 + l.gust * 2.6);
        l.gust = Math.max(0, l.gust - dt * 0.5);
        const x = l.x + Math.sin(t * l.sway + l.ph) * (1.4 + l.gust * 4.0);
        const z = l.z + Math.cos(t * l.sway * 0.7 + l.ph) * (0.8 + l.gust * 2.2) + t * 0.6 * l.gust;
        if (l.y < WATER_Y - 0.1) {
          l.y = rr(7.5, 13.0);
          l.x = rr(-HW - 12, HW + 16);
          l.z = rr(-72, 56);
        }
        d.position.set(x, l.y, z);
        d.rotation.set(Math.sin(t * l.spin + l.ph) * 1.1, t * l.spin * 0.4 + l.ph, Math.cos(t * l.spin * 0.8 + l.ph) * 0.8);
        d.scale.setScalar(eye && Math.hypot(x - eye.x, l.y - eye.y, z - eye.z) < 3.2 ? 0 : l.scale);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 装配 */
export function buildProps(scene, columns, anchors, bridges) {
  const field = new LanternField(scene, columns);

  anchors.gateLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ff9a5c' : '#ffd2a0', size: 1.1, shape: 'hex', column: true, columnDepth: 9 }));
  anchors.bellLamps.forEach((p, i) => field.add(p, { color: i === 2 ? '#ffe0b0' : '#ffab63', size: i === 2 ? 1.3 : 1.05, shape: 'hex', column: i !== 2, columnDepth: 10 }));
  anchors.hallLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ff9f66' : '#ffd2a0', size: 1.1, shape: 'hex', column: i % 3 === 0, columnDepth: 10 }));
  anchors.hallWindows.forEach((p) => field.add(p, { color: '#ffe3b4', size: 0.72, shape: 'hex' }));
  anchors.courtLamps.forEach((p) => field.add(p, { color: '#ffbe72', size: 0.95 }));
  anchors.pagodaLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ffcf8a' : '#ffb066', size: 0.62, shape: 'hex' }));
  anchors.pagodaTierLamps.forEach((p) => field.add(p, { color: '#ffd8a2', size: 0.9, shape: 'hex', column: true, columnDepth: 9 }));
  anchors.steleLamps.forEach((p) => field.add(p, { color: '#ffca8a', size: 0.85, shape: 'hex' }));
  anchors.wallLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ffb877' : '#ffd9a8', size: 0.8, column: i % 4 === 0, columnDepth: 8 }));
  anchors.bridgeLamps.forEach((p) => field.add(p, { color: '#ffe0b0', size: 1.0, shape: 'hex', column: true, columnDepth: 8 }));
  anchors.archLamps.forEach((p, i) => field.add(p, { color: '#ffb066', size: 0.78, column: i % 3 === 0, columnDepth: 6 }));
  anchors.guanLamps.forEach((p, i) => field.add(p, { color: i === 2 ? '#ff8f5e' : '#ffc57e', size: 1.05, shape: 'hex', column: i < 2, columnDepth: 9 }));
  anchors.shopLamps.forEach((p) => field.add(p, { color: FIRE(), size: 0.88 }));
  anchors.houseEaves.forEach((p, i) => field.add(p, { color: i % 3 === 0 ? '#ff7f4a' : '#ffbe72', size: 0.82, column: i % 5 === 0, columnDepth: 7 }));
  anchors.windowGlow.forEach((p) => field.add(p, { color: '#ffdcae', size: 0.66, shape: 'hex' }));
  anchors.streetLamps.forEach((p) => field.add(p, { color: '#ff9d5e', size: 1.0, shape: 'hex', column: true, columnDepth: 8 }));
  anchors.ferryLamps.forEach((p) => field.add(p, { color: '#ffcf8a', size: 1.05, column: true, columnDepth: 8 }));
  if (anchors.pagodaTop) field.add(anchors.pagodaTop, { color: '#ffe6b8', size: 1.3, shape: 'hex', column: true, columnDepth: 12 });
  field.build();

  const leaves = fallingLeaves(scene);
  return {
    field,
    strings: overheadStrings(scene, anchors, columns),
    fleet: new Fleet(scene, columns, { moving: 3 }),
    crowd: new Crowd(scene, bridges),
    leaves,
  };
}

export { PAL };
