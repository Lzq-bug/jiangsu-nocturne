import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh, box, rand, rr, stringPath, figureGeo, loftHull } from '../kit.js';
import { LanternField, Crowd } from '../props.js';
import { WATER_Y } from '../water.js';
import { PJ, archDeckY } from './architecture.js';
import { RIVER, BRIDGES } from './data.js';
import * as T from '../textures.js';

const Q = RIVER.quayY, HW = RIVER.halfWidth;
const LAMP = () => (rand() > 0.72 ? '#ff8f5e' : rand() > 0.34 ? '#ffc07a' : '#ffe0b4');

const roundGeo = new THREE.SphereGeometry(0.42, 12, 9);
roundGeo.scale(1, 0.84, 1);
const hexGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.72, 6);
const _v = new THREE.Vector3();

/* ------------------------------------------------------------------ 沿街灯笼串 */
/** 檐口之间牵一线，串上小红灯笼：只在同侧、间距合适时成串 */
function lanternStrings(scene, anchors, columns) {
  const grp = new THREE.Group();
  const linePos = [], bulbPos = [], bulbCol = [], bulbSize = [], bulbPhase = [];
  const sides = new Map();
  for (const p of anchors.eaves) {
    const key = `${p.x > 0 ? 'e' : 'w'}${Math.round(Math.abs(p.x))}`;
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push(p);
  }
  const warm = new THREE.Color('#ff9a63'), gold = new THREE.Color('#ffce8f');
  for (const list of sides.values()) {
    list.sort((a, b) => a.z - b.z);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (b.z - a.z > 13) continue;
      const pts = stringPath(a.clone().setY(a.y + 0.35), b.clone().setY(b.y + 0.35), 0.55, 20);
      for (let k = 0; k < pts.length - 1; k++) {
        linePos.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
      }
      for (let k = 2; k < pts.length - 1; k += 2) {
        const p = pts[k];
        bulbPos.push(p.x, p.y - 0.34, p.z);
        const c = k % 6 === 0 ? warm : gold;
        const m = 2.0 + rand() * 0.5;
        bulbCol.push(c.r * m, c.g * m, c.b * m);
        bulbSize.push(1.1 + rand() * 0.5);
        bulbPhase.push(rand());
      }
      const mid = pts[Math.floor(pts.length / 2)];
      columns.add(mid.clone().setY(mid.y - 1.0), '#ffb877', 1.6, 7, 0.7);
    }
  }
  // 跨河灯串：红笼悬在河心，每一根线在水面拖一道光
  const red = new THREE.Color('#ff6a42');
  for (const [a, b] of anchors.stringEnds) {
    const pts = stringPath(a, b, 0.62, 22);
    for (let k = 0; k < pts.length - 1; k++) {
      linePos.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
    }
    for (let k = 3; k < pts.length - 1; k += 3) {
      const p = pts[k];
      bulbPos.push(p.x, p.y - 0.42, p.z);
      bulbCol.push(red.r * 2.6, red.g * 2.6, red.b * 2.6);
      bulbSize.push(1.5 + rand() * 0.5);
      bulbPhase.push(rand());
    }
    const mid = pts[Math.floor(pts.length / 2)].clone().setY(pts[Math.floor(pts.length / 2)].y - 0.5);
    columns.add(mid, '#ff824f', 2.6, 6.2, 2.1);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x11161f, fog: false })));

  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
  bg.setAttribute('aCol', new THREE.Float32BufferAttribute(bulbCol, 3));
  bg.setAttribute('aSize', new THREE.Float32BufferAttribute(bulbSize, 1));
  bg.setAttribute('aPhase', new THREE.Float32BufferAttribute(bulbPhase, 1));
  const bm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,196,146', 0.05) }, uOn: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
      uniform float uTime; uniform float uOn; varying vec3 vC; varying float vA;
      void main(){ vC = aCol; vA = uOn*(0.72+0.28*sin(uTime*2.7+aPhase*6.28));
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = min(34.0, aSize*240.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.3); }`,
  });
  const bulbs = new THREE.Points(bg, bm);
  bulbs.frustumCulled = false;
  bulbs.renderOrder = 5;
  grp.add(bulbs);
  scene.add(grp);
  return { grp, uni: bm.uniforms };
}

/* ------------------------------------------------------------------ 摇橹船 */
function wupengGeometry() {
  const stations = [-3.4, -2.4, -0.9, 0.9, 2.4, 3.4];
  const profile = (z) => {
    const t = Math.abs(z) / 3.4;
    const b = 0.78 * Math.pow(Math.max(0.02, 1 - t * t * 0.94), 0.6);
    return [[-b, 0.4], [-b * 0.9, -0.1], [-b * 0.4, -0.42], [b * 0.4, -0.42], [b * 0.9, -0.1], [b, 0.4], [b * 0.5, 0.5], [-b * 0.5, 0.5]];
  };
  const parts = [loftHull(profile, stations, false)];
  parts.push(box(1.3, 0.1, 6.9, 0, 0.46, 0));
  const bow = new THREE.ConeGeometry(0.34, 1.2, 6);
  bow.rotateX(-Math.PI / 2);
  bow.translate(0, 0.32, -3.9);
  parts.push(bow);
  return mergeGeometries(parts);
}
function canopyGeometry() {
  // 竹蓬：半截圆筒横躺在船中段
  const g = new THREE.CylinderGeometry(0.66, 0.66, 2.6, 12, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

class WupengFleet {
  constructor(scene, columns, { count = 4 } = {}) {
    this.columns = columns;
    this.boats = [];
    const hullGeo = wupengGeometry();
    const canopyGeo = canopyGeometry();
    const wake = new THREE.PlaneGeometry(1.6, 6);
    for (let i = 0; i < count; i++) {
      const grp = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, PJ.woodDark);
      hull.castShadow = true;
      grp.add(hull);
      const can = new THREE.Mesh(canopyGeo, PJ.bamboo);
      can.position.set(0, 0.44, 0.3);
      can.castShadow = true;
      grp.add(can);
      // 船篷里透出的一点光
      const inside = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), glow('#ffbf86', 1.5));
      inside.position.set(0, 0.3, 0.35);
      inside.rotation.x = -Math.PI / 2;
      grp.add(inside);
      const lamp = new THREE.Mesh(roundGeo.clone().scale(0.62, 0.62, 0.62), glow(i % 3 === 0 ? '#ff9a62' : '#ffd6a2', 1.7));
      lamp.position.set(0, 1.05, -2.9);
      grp.add(lamp);
      grp.add(new THREE.Mesh(box(0.04, 0.8, 0.04, 0, 0.7, -2.9), PJ.dark));
      const oarman = new THREE.Mesh(figureGeo(0.86), PJ.dark);
      oarman.position.set(0, 0.42, 2.5);
      grp.add(oarman);
      const oar = new THREE.Mesh(box(0.08, 0.08, 2.6, 0, 0.5, 3.8), PJ.wood);
      oar.rotation.x = 0.5;
      grp.add(oar);
      const foam = new THREE.Mesh(wake, new THREE.MeshBasicMaterial({
        map: T.softGlow('206,226,252', 0.16), transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(0, WATER_Y + 0.06, 4.4);
      grp.add(foam);
      scene.add(grp);

      const b = {
        grp, foam, lamp,
        lane: (i % 2 ? 1.3 : -1.4) + rr(-0.5, 0.5),
        t: rand(),
        dir: i % 2 ? 1 : -1,
        speed: rr(0.0042, 0.0072),
        phase: rand() * 6.28,
        colLamp: columns.add(new THREE.Vector3(0, 0, 0), '#ffce96', 0.9, 4.6, 1.05),
        colMid: columns.add(new THREE.Vector3(0, 0, 0), '#ffb877', 1.6, 7.5, 1.15),
      };
      this.boats.push(b);
    }
    // 泊在河埠边的两条，船头一盏灯照着石阶
    for (let i = 0; i < 2; i++) {
      const grp = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, PJ.woodDark);
      const can = new THREE.Mesh(canopyGeo, PJ.bamboo);
      can.position.set(0, 0.44, 0.2);
      const lamp = new THREE.Mesh(roundGeo.clone().scale(0.6, 0.6, 0.6), glow('#ffb06a', 1.6));
      lamp.position.set(0, 1.0, -2.7);
      grp.add(hull, can, lamp);
      grp.position.set(-(HW + 1.1) - i * 1.9, WATER_Y + 0.34, -70 + i * 6.2);
      grp.rotation.y = 0.1 - i * 0.16;
      scene.add(grp);
      const ci = columns.add(grp.position.clone(), '#ff9f63', 1.4, 6.5, 1.1);
      this.boats.push({ grp, moored: true, phase: rand() * 6.28, colMid: ci, foam: null });
    }
  }
  moored(i = 0) {
    return this.boats.filter((b) => b.moored)[i]?.grp || null;
  }
  update(t, dt, speedScale) {
    const half = RIVER.length / 2 - 5;
    for (const b of this.boats) {
      const p = b.grp.position;
      if (b.moored) {
        p.y = WATER_Y + 0.34 + Math.sin(t * 0.8 + b.phase) * 0.045;
        b.grp.rotation.z = Math.sin(t * 0.6 + b.phase) * 0.022;
        this.columns.setPos(b.colMid, p);
        continue;
      }
      b.t += dt * b.speed * speedScale * b.dir;
      if (b.t > 1) b.t -= 1;
      if (b.t < 0) b.t += 1;
      const z = (b.t - 0.5) * 2 * half;
      const sway = Math.sin(t * 0.32 + b.phase);
      p.set(b.lane + sway * 0.16, WATER_Y + 0.22 + Math.sin(t * 1.5 + b.phase) * 0.05, z);
      b.grp.rotation.y = (b.dir > 0 ? Math.PI : 0) + sway * 0.04;
      b.grp.rotation.z = Math.sin(t * 1.2 + b.phase) * 0.026;
      b.grp.rotation.x = Math.sin(t * 0.9 + b.phase * 1.4) * 0.014;
      if (b.foam) b.foam.scale.set(1, 0.4 + speedScale * 0.6, 1);
      this.columns.setPos(b.colLamp, _v.set(p.x, p.y, p.z - 2.9 * b.dir));
      this.columns.setPos(b.colMid, p);
    }
  }
}

/* ------------------------------------------------------------------ 晾衣与竹竿 */
function dryingPoles(scene, anchors) {
  const g = new THREE.Group();
  const poles = [], cloth = [];
  for (const p of anchors.doorLamps) {
    if (rand() > 0.6) continue;
    const x = p.x + 1.4, z = p.z, y = Q + 2.35;
    for (const s of [-1, 1]) poles.push(box(0.07, 0.07, 2.6, x, y, z + s * 1.3));
    const pts = stringPath(new THREE.Vector3(x, y, z - 1.25), new THREE.Vector3(x, y, z + 1.25), 0.16, 10);
    for (let k = 0; k < 3; k++) {
      const p = pts[2 + k * 3];
      cloth.push(box(0.02, rr(0.7, 1.05), rr(0.5, 0.8), p.x, p.y - 0.5, p.z));
    }
  }
  if (!poles.length) return g;
  g.add(mesh(poles, PJ.bamboo));
  g.add(mesh(cloth, PJ.cloth));
  scene.add(g);
  return g;
}

/* ------------------------------------------------------------------ 河灯 */
function riverLamps(scene) {
  const N = 34;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
  const cs = [new THREE.Color('#ffd28f'), new THREE.Color('#ff9a6a'), new THREE.Color('#a8ecd4')];
  for (let i = 0; i < N; i++) {
    pos.set([rr(-HW + 1.4, HW - 1.4), WATER_Y + 0.1, rr(-RIVER.length / 2, RIVER.length / 2)], i * 3);
    const c = cs[(rand() * 3) | 0];
    col.set([c.r * 2.2, c.g * 2.2, c.b * 2.2], i * 3);
    size[i] = rr(0.6, 1.15);
    ph[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,204,150', 0.1) }, uFlow: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
      uniform float uTime; uniform float uFlow; varying vec3 vC; varying float vA;
      void main(){ vec3 p = position;
        p.z = mod(p.z + ${(RIVER.length / 2).toFixed(1)} + uTime*0.55*uFlow, ${RIVER.length.toFixed(1)}) - ${(RIVER.length / 2).toFixed(1)};
        p.x += sin(uTime*0.6+aPhase*6.28)*0.35;
        p.y += sin(uTime*1.7+aPhase*6.28)*0.05;
        vC = aCol; vA = 0.7+0.3*sin(uTime*2.0+aPhase*6.28);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = min(26.0,aSize*170.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.7); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, uni: m.uniforms };
}

/* ------------------------------------------------------------------ 人流路径 */
const lane = (x, z0, z1, y = Q + 0.3) => ({ a: [x, y, z0], b: [x, y, z1] });
const PJ_PATHS = [
  lane(-5.4, -84, 84),
  lane(-6.6, 80, -80),
  lane(-8.4, -70, 70),
  lane(HW + 2.4, -66, 66),
  lane(HW + 3.1, 60, -60),
  { a: [6.4, Q + 0.3, -2], b: [28, Q + 0.3, -2] },        // 钮家巷
  { a: [26, Q + 0.3, 22], b: [6.8, Q + 0.3, 22] },        // 菉葭巷
  { a: [7.4, Q + 0.3, 56], b: [26, Q + 0.3, 56] },        // 大儒巷
];
/** 拱桥上的走法：横过河面，脚下跟着桥面起拱 */
const ARCH_Z = (BRIDGES.find((b) => b.kind === 'arch') || { z: 0 }).z;
function bridgeAt(u, off) {
  const half = HW + 3.2;
  const x = -half + 2 * half * u;
  return { x, y: archDeckY(x) + 0.75, z: ARCH_Z + off * 1.1, heading: x > 0 ? Math.PI : 0 };
}

/* ------------------------------------------------------------------ 水面灯池 */
/** 窄河上视角太浅，竖直光柱会被压成一条线：把灯影直接铺在水面上 */
function riverGlints(scene, anchors) {
  const parts = [];
  for (const [a, b] of anchors.stringEnds) {
    const g = new THREE.PlaneGeometry(1.9, 8.2);
    g.rotateX(-Math.PI / 2);
    g.translate((a.x + b.x) / 2, 0.05, (a.z + b.z) / 2);
    parts.push(g);
  }
  if (!parts.length) return null;
  const mat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,146,92', 0.22), transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, mat };
}

/* ------------------------------------------------------------------ assemble */
export function buildProps(scene, columns, anchors) {
  const field = new LanternField(scene, columns);

  anchors.eaves.forEach((p, i) => field.add(p, {
    color: i % 5 === 0 ? '#ff7f52' : LAMP(), size: rr(0.55, 0.8),
    column: i % 4 === 0, columnDepth: 5,
  }));
  anchors.lampPosts.forEach((p) => field.add(p, { color: '#ffe3ae', size: 0.62, shape: 'hex', column: true, columnDepth: 6.5 }));
  anchors.windows.forEach((p) => field.add(p, { color: '#ffdcae', size: 0.5, shape: 'hex' }));
  anchors.doorLamps.forEach((p) => field.add(p, { color: '#ffc07a', size: 0.62 }));
  anchors.alleyLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ffab6b' : '#ffd9a4', size: 0.7, column: i % 3 === 0, columnDepth: 5 }));
  anchors.alleyEnd.forEach((p) => field.add(p, { color: '#ff9463', size: 0.6 }));
  anchors.bridgeLamps.forEach((p) => field.add(p, { color: '#ffe6bc', size: 0.66, shape: 'hex', column: true, columnDepth: 6 }));
  anchors.archLamps.forEach((p) => field.add(p, { color: '#ffd08a', size: 0.9, column: true, columnDepth: 8 }));
  anchors.quayLamps.forEach((p) => field.add(p, { color: '#ffd9a2', size: 0.7, column: true, columnDepth: 5.5 }));
  anchors.ferryLamps.forEach((p, i) => field.add(p, { color: i % 2 ? '#ffab6b' : '#ffd2a0', size: 0.66, column: true, columnDepth: 5 }));
  anchors.shopDoors.forEach((p) => field.add(p, { color: LAMP(), size: 0.58 }));
  anchors.gate.forEach((p) => field.add(p, { color: '#ffe6b8', size: 0.85, shape: 'hex', column: true, columnDepth: 7 }));
  field.build();

  dryingPoles(scene, anchors);
  return {
    field,
    strings: lanternStrings(scene, anchors, columns),
    fleet: new WupengFleet(scene, columns, { count: 4 }),
    crowd: new Crowd(scene, {
      paths: PJ_PATHS,
      bridgeAt,
      bridgeEvery: 16,
      lanternRate: 0.22,
    }),
    riverLamps: riverLamps(scene),
    glints: riverGlints(scene, anchors),
  };
}
