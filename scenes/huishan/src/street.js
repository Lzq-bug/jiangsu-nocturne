/**
 * 直街与寺塘泾：街随水走。真实尺度——水面宽 5—6 米，街宽 6 米、长 388 米，
 * 砖木铺面四十七间前店后坊，祠堂沿河栉比。
 */
import * as THREE from 'three';
import {
  M, glow, lit, box, mesh, rand, rr,
  chineseRoof, ridgeOrnament, pillarGeo, plaqueMesh, stringPath, registerOccluder,
} from './kit.js';
import * as T from './textures.js';
import { treeRow } from './build.js';
import { CREEK, GROUND, STATIONS } from './data.js';

const Y = GROUND.street;
const LANE = CREEK.streetWidth;          // 6 米
const FACE = 1.5;                        // 街沿到门面线的距离

let mats = null;
function useMats() {
  if (mats) return mats;
  const red = new THREE.MeshBasicMaterial({ map: T.lanternPaper('#fff0cc', '#e8613a') });
  red.toneMapped = false;
  mats = {
    lanternRed: red,
    woodDark: lit('#5c3a28', { map: T.wood('#4a2b1c', '#2c170f'), rough: 0.75 }),
    // 窗里透出的是窗棂，不是一块黄板
    win: new THREE.MeshBasicMaterial({ map: T.lattice(4, 3, '#3a2418', '#ffcf94') }),
    quay: lit('#9aa1ad', { map: T.stone('#7f8794'), rough: 0.92, emissive: '#131a28', ei: 0.45 }),
    slate: lit('#8b93a0', { map: T.stone('#6f7783'), rough: 0.94, emissive: '#101620', ei: 0.4 }),
  };
  return mats;
}

/* ------------------------------------------------------------------ 地 */

/**
 * 两岸地台：贴着浜线走的条带，比整张地面挖洞稳——
 * 浜在弯，矩形洞的边界一定会和岸线打架。
 */
function ground(scene) {
  const N = 120;
  const out = [];
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    const lanes = [0.6, 7.5, 22, 46];
    for (let i = 0; i <= N; i++) {
      const z = CREEK.zFrom - 6 + ((CREEK.zTo + 12 - CREEK.zFrom) * i) / N;
      const e = side < 0 ? CREEK.northEdge(z) : CREEK.southEdge(z);
      for (const o of lanes) {
        pos.push(e + side * o, Y - 0.12 + (o === 0.6 ? 0.04 : 0), z);
        uv.push(o / 12, i / N * 2.2);
      }
    }
    const row = lanes.length;
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < row - 1; k++) {
        const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
        if (side < 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.slate);
    m.receiveShadow = true;
    scene.add(m);
    out.push(m);
  }
  return out;
}

/** 两岸石驳：贴浜的一圈直壁 + 顶面伏脚石 */
function quays(scene) {
  const N = 150;
  const out = [];
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    const rows = [
      { y: -1.3, o: 0.75 },
      { y: 0.7, o: 0.45 },
      { y: Y - 0.3, o: 0.1 },
      { y: Y, o: 0 },
      { y: Y, o: 0.7 },
    ];
    for (let i = 0; i <= N; i++) {
      const z = CREEK.zFrom + ((CREEK.zTo - CREEK.zFrom) * i) / N;
      const e = side < 0 ? CREEK.northEdge(z) : CREEK.southEdge(z);
      for (const r of rows) {
        pos.push(e + side * r.o, r.y, z);
        uv.push((i / N) * 2.4, r.y);
      }
    }
    const row = rows.length;
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < row - 1; k++) {
        const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
        if (side < 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.quay);
    m.receiveShadow = true;
    scene.add(m);
    out.push(m);
  }
  return out;
}

/** 河埠头：石阶斜插进水里 */
function wharves(scene, columns) {
  const grp = new THREE.Group();
  for (const w of CREEK.wharves) {
    const side = w.side;
    const e = side < 0 ? CREEK.northEdge(w.z) : CREEK.southEdge(w.z);
    const steps = [];
    for (let k = 0; k < 5; k++) {
      steps.push(box(0.85, 0.46, w.len, e + side * (0.3 + k * 0.55), Y - 0.4 - k * 0.56, w.z));
    }
    steps.push(box(0.45, 1.0, 0.45, e - side * 0.15, Y + 0.35, w.z - w.len / 2 - 0.35));
    steps.push(box(0.45, 1.0, 0.45, e - side * 0.15, Y + 0.35, w.z + w.len / 2 + 0.35));
    grp.add(mesh(steps, M.stoneDressed));
    columns.add(new THREE.Vector3(e + side * 0.8, 0, w.z), '#ffcf94', 2.2, 6.8, 0.8, CREEK.waterY);
  }
  scene.add(grp);
  return grp;
}

/* ------------------------------------------------------------------ 房子 */

/**
 * 街屋：面阔沿 Z、进深沿 X，正面（+X）开槛窗与幌子，可两层。
 * 屋顶的屋脊因此也沿 Z，跟秦淮那一路做法一致。
 */
function shop({ bays = 2, bayW = 4.0, depth = 8, h = 3.5, two = false, sign = '', y = Y }) {
  const grp = new THREE.Group();
  const w = bays * bayW;
  const total = two ? h + 3.0 : h;
  const walls = [], timber = [], litWin = [], extra = [];
  walls.push(box(depth + 0.5, 0.36, w + 0.4, 0, y + 0.18, 0));
  walls.push(box(0.4, total, w, -depth / 2, y + total / 2 + 0.36, 0));
  walls.push(box(depth, total, 0.4, 0, y + total / 2 + 0.36, -w / 2));
  walls.push(box(depth, total, 0.4, 0, y + total / 2 + 0.36, w / 2));
  for (let i = 0; i <= bays; i++) {
    const z = -w / 2 + bayW * i;
    timber.push(pillarGeo(total, 0.17, true).clone().translate(depth / 2 - 0.35, y + 0.36, z));
    if (i < bays) {
      const cz = -w / 2 + bayW * (i + 0.5);
      walls.push(box(0.14, 1.55, bayW * 0.6, depth / 2 - 0.55, y + 1.45, cz));
      litWin.push(box(0.06, 1.25, bayW * 0.48, depth / 2 - 0.44, y + 1.5, cz));
      if (two) {
        walls.push(box(0.14, 1.3, bayW * 0.55, depth / 2 - 0.55, y + h + 1.5, cz));
        if (rand() > 0.4) litWin.push(box(0.06, 1.05, bayW * 0.44, depth / 2 - 0.44, y + h + 1.5, cz));
      }
    }
  }
  if (two) walls.push(box(depth - 0.6, 0.22, w - 0.8, -0.1, y + h + 0.36, 0));
  // 檐廊平座与挑檐
  walls.push(box(1.5, 0.18, w, depth / 2 + 0.7, y + total * 0.84, 0));
  const rf = mesh([chineseRoof({ width: total * 0.86, depth: w + 1.4, height: 1.7, ridgeRatio: 0.52, hip: false, overhang: 0.5 })], M.roof);
  rf.position.set(0, y + total + 0.36, 0);
  rf.rotation.y = Math.PI / 2;
  const rd = mesh([ridgeOrnament({ width: total * 0.86, depth: w + 1.4, height: 1.7, ridgeRatio: 0.52 })], M.ridge);
  rd.position.set(0, y + total + 0.36, 0);
  rd.rotation.y = Math.PI / 2;
  grp.add(mesh(walls, M.wall));
  grp.add(mesh(timber, M.pillar));
  grp.add(mesh(litWin, mats.win));
  grp.add(rf);
  grp.add(rd);
  if (sign) {
    const p = plaqueMesh(sign, 0.9, 2.4, { dir: 'v', bg: '#1b2a44', fg: '#f2dcae' });
    p.position.set(depth / 2 + 0.05, y + total * 0.58, -w / 2 + 1.0);
    p.rotation.y = Math.PI / 2;
    grp.add(p);
    extra.push(p);
    // 布幌一面，风里挂着的招牌
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 2.3),
      new THREE.MeshBasicMaterial({ map: T.banner(sign.slice(0, 2)), transparent: true, side: THREE.DoubleSide }),
    );
    cloth.material.toneMapped = false;
    cloth.position.set(depth / 2 + 1.3, y + total * 0.62, w / 2 - 1.2);
    cloth.rotation.set(0, 0.5, 0.02);
    grp.add(cloth);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), M.beam);
    pole.rotation.z = Math.PI / 2;
    pole.position.set(depth / 2 + 0.7, y + total * 0.72, w / 2 - 1.2);
    grp.add(pole);
  }
  return { group: grp, w, total, depth };
}

/** 祠堂门厅：台基、抱鼓石、匾额，尺度比铺面大一档 */
function shrine({ name = '', hallW = 13, depth = 12, h = 5.2, y = Y }) {
  const grp = new THREE.Group();
  const base = [], walls = [], timber = [], fans = [];
  base.push(box(depth + 3.2, 0.62, hallW + 2.4, 0, y + 0.31, 0));
  for (let k = 0; k < 3; k++) base.push(box(1.2, 0.22, hallW * 0.56, depth / 2 + 2.4 + k * 1.05, y + 0.11 + k * 0.22, 0));
  walls.push(box(0.46, h, hallW + 0.5, -depth / 2, y + h / 2 + 0.62, 0));
  walls.push(box(depth, h, 0.46, 0, y + h / 2 + 0.62, -hallW / 2));
  walls.push(box(depth, h, 0.46, 0, y + h / 2 + 0.62, hallW / 2));
  for (let i = 0; i <= 4; i++) {
    const z = -hallW / 2 + (hallW * i) / 4;
    timber.push(pillarGeo(h, 0.25, true).clone().translate(depth / 2 - 0.7, y + 0.62, z));
  }
  for (let i = 0; i < 6; i++) {
    fans.push(box(0.13, h * 0.76, hallW / 6 - 0.32, depth / 2 - 0.5, y + h * 0.44, -hallW / 2 + (hallW / 6) * (i + 0.5)));
  }
  const rf = mesh([chineseRoof({ width: h * 1.04, depth: hallW + 3.0, height: 2.3, ridgeRatio: 0.4, overhang: 0.7 })], M.roofGreen);
  rf.position.set(0, y + h + 0.62, 0);
  rf.rotation.y = Math.PI / 2;
  const rd = mesh([ridgeOrnament({ width: h * 1.04, depth: hallW + 3.0, height: 2.3, ridgeRatio: 0.4 })], M.ridge);
  rd.position.set(0, y + h + 0.62, 0);
  rd.rotation.y = Math.PI / 2;
  grp.add(mesh(base, M.stoneDressed));
  grp.add(mesh(walls, M.wall));
  grp.add(mesh(timber, M.pillarBright));
  grp.add(mesh(fans, useMats().woodDark));
  grp.add(rf);
  grp.add(rd);
  grp.add(mesh(box(0.07, h * 0.56, hallW * 0.4, depth / 2 - 0.42, y + h * 0.4, 0), glow('#ffb463', 0.85)));
  if (name) {
    const p = plaqueMesh(name, Math.min(hallW * 0.4, 4.6), 1.05, { dir: 'h', bg: '#16233a', fg: '#e8cf9c' });
    p.position.set(depth / 2 - 0.3, y + h * 0.86, 0);
    p.rotation.y = Math.PI / 2;
    grp.add(p);
  }
  for (const s of [-1, 1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 12), M.stoneDressed);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(depth / 2 + 1.6, y + 1.1, s * (hallW / 2 - 0.6));
    grp.add(drum);
  }
  // 祠前照壁与柏树，夜里只剩轮廓
  const screen = box(0.5, 2.6, 5.2, depth / 2 + 4.2, y + 1.3, 0);
  grp.add(mesh([screen], M.redWall));
  return { group: grp, hallW, h: y + h, depth };
}

/* ------------------------------------------------------------------ 灯与桥 */

function lanternRow(scene, spots) {
  const grp = new THREE.Group();
  for (const [x, y, z] of spots) {
    const g = new THREE.SphereGeometry(0.26, 9, 7);
    g.scale(1, 1.3, 1);
    grp.add(new THREE.Mesh(g, useMats().lanternRed).translateX(x).translateY(y).translateZ(z));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,168,96', 0.14), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    halo.position.set(x, y, z);
    halo.scale.set(3.2, 3.2, 1);
    grp.add(halo);
  }
  scene.add(grp);
  return grp;
}

/** 跨街灯笼：六米宽的街，一道绳挂七只 */
function crossString(scene, from, to, count = 7) {
  const pts = stringPath(from, to, 1.0, count * 2);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.028, 4, false), M.dark));
  const grp = new THREE.Group();
  for (let i = 1; i < count; i++) {
    const p = pts[Math.round((i / count) * (pts.length - 1))];
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 4), M.dark);
    cord.position.set(p.x, p.y - 0.21, p.z);
    grp.add(cord);
    const g = new THREE.SphereGeometry(0.24, 9, 7);
    g.scale(1, 1.28, 1);
    const l = new THREE.Mesh(g, useMats().lanternRed);
    l.position.set(p.x, p.y - 0.62, p.z);
    grp.add(l);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.09, 7), M.gilt);
    cap.position.set(p.x, p.y - 0.3, p.z);
    grp.add(cap);
  }
  scene.add(grp);
  return grp;
}

/** 石灯柱 */
function stoneLamps(scene, spots, columns) {
  const shaft = [], head = [], glowParts = [];
  for (const [x, z] of spots) {
    shaft.push(box(0.3, 2.3, 0.3, x, Y + 1.15, z));
    shaft.push(box(0.62, 0.26, 0.62, x, Y + 0.13, z));
    head.push(box(0.8, 0.2, 0.8, x, Y + 2.6, z));
    const roof = new THREE.ConeGeometry(0.7, 0.54, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.translate(x, Y + 3.02, z);
    head.push(roof);
    glowParts.push(box(0.36, 0.52, 0.36, x, Y + 2.18, z));
    columns.add(new THREE.Vector3(x, 0, z), '#ffbe7a', 1.3, 5.6, 0.7, CREEK.waterY);
  }
  const grp = new THREE.Group();
  grp.add(mesh(shaft, M.stoneDressed));
  grp.add(mesh(head, M.stone));
  grp.add(mesh(glowParts, glow('#ffd79b', 1.9)));
  scene.add(grp);
  return grp;
}

/** 单孔石拱桥：拱腹圆到能和水面对成一只圈 */
function archBridge(scene, { z, rise, width, name }) {
  const grp = new THREE.Group();
  const half = CREEK.halfAt(z) + 2.4;
  const cx = CREEK.xAt(z);
  const segs = 20;
  const arch = [], deck = [], rail = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = cx - half + 2 * half * t;
    const s = Math.sin(Math.PI * t);
    arch.push(box(2 * half / segs + 0.04, 0.46, width * 0.88, x, Y - 0.5 + rise * s, z));
    deck.push(box(2 * half / segs + 0.04, 0.28, width, x, Y - 0.22 + rise * s, z));
    for (const o of [-1, 1]) {
      rail.push(box(2 * half / segs + 0.04, 0.5, 0.16, x, Y + 0.62 + rise * s, z + o * (width / 2 - 0.1)));
      if (i % 4 === 0) {
        rail.push(box(0.24, 0.8, 0.24, x, Y + 0.8 + rise * s, z + o * (width / 2 - 0.1)));
        rail.push(new THREE.SphereGeometry(0.13, 7, 5).translate(x, Y + 1.22 + rise * s, z + o * (width / 2 - 0.1)));
      }
    }
  }
  grp.add(mesh(arch, M.stoneDressed));
  grp.add(mesh(deck, M.stone));
  grp.add(mesh(rail, M.stoneDressed));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), glow('#ffcf94', 2.1));
  lamp.position.set(cx, Y + rise - 0.3, z);
  grp.add(lamp);
  if (name) {
    const p = plaqueMesh(name, 1.5, 0.7, { dir: 'h', bg: '#3d4453', fg: '#e6ecd8', border: '#767f8d' });
    p.position.set(cx + half * 0.62, Y + rise * 0.55, z + width / 2 + 0.02);
    grp.add(p);
  }
  scene.add(grp);
  return grp;
}

/** 乌篷船：船体放样 + 竹篾篷 + 船头灯 */
function boat(scene, { z, side }) {
  const grp = new THREE.Group();
  const e = side < 0 ? CREEK.northEdge(z) : CREEK.southEdge(z);
  const x = e + side * 1.35;
  const len = 6.4, beam = 1.45;
  const pos = [], uv = [], idx = [];
  const stations = 10, nv = 5;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const zz = -len / 2 + len * t;
    const w = beam * Math.sin(Math.PI * Math.min(1, 0.14 + t * 0.8));
    const sheer = 0.42 + 0.95 * Math.pow(Math.abs(t - 0.5) * 2, 2.4);
    const ring = [[w, -0.14], [w * 0.7, sheer], [-w * 0.7, sheer], [-w, -0.14], [0, -0.5]];
    for (const [px, py] of ring) {
      pos.push(px, py, zz);
      uv.push(i / stations, py * 0.4 + 0.5);
    }
  }
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < nv - 1; k++) {
      const a = i * nv + k, b = a + 1, c = a + nv, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  grp.add(new THREE.Mesh(g, useMats().woodDark));
  const weave = new THREE.MeshStandardMaterial({ map: T.wupengWeave(), color: 0x59564e, roughness: 0.9 });
  for (const o of [-0.9, 0.85]) {
    const canopy = new THREE.CylinderGeometry(0.72, 0.72, 1.8, 9, 1, false, 0, Math.PI);
    canopy.rotateX(Math.PI / 2);
    canopy.rotateZ(Math.PI);
    canopy.translate(0, 0.42, o);
    grp.add(new THREE.Mesh(canopy, weave));
  }
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 7), useMats().lanternRed);
  lantern.position.set(0.35, 1.15, len / 2 - 1.0);
  grp.add(lantern);
  grp.position.set(x, CREEK.waterY + 0.12, z);
  grp.rotation.y = side < 0 ? Math.PI / 2 + 0.05 : -Math.PI / 2 - 0.05;
  scene.add(registerOccluder(grp, 3.6, new THREE.Vector3(x, 0.2, z)));
  return grp;
}

/* ------------------------------------------------------------------ 组合 */

const SHRINES = [
  '华孝子祠', '至德祠', '范文正公祠', '朱文公祠', '司马温公祠',
  '陆宣公祠', '倪云林祠', '尤文简公祠', '钱武肃王祠', '顾洞阳祠',
  '淮湘昭忠祠', '留耕草堂', '杨藕芳祠', '王武愍公祠',
];
const SHOPS = ['惠山泥人', '泉上茶寮', '南货行', '纸马铺', '裱画斋', '豆腐花', '油氽花生', '香烛店', '锡山酒坊', '酱园'];

export function buildStreet(scene, columns, reflections) {
  useMats();
  const root = new THREE.Group();
  root.name = 'street';
  scene.add(root);

  ground(scene);
  quays(scene);
  wharves(scene, columns);

  // 北岸（直街一侧）：铺面与祠堂交替
  const northRow = new THREE.Group();
  const eaveSpots = [];
  // 北岸的铺面从寺前空出来一段：直街本来就到山门为止，
  // 山门外的寺院前广场（z 到 26）不能压上房子，不然惠山寺机位就站在屋里
  let zi = CREEK.zFrom + 86;
  let si = 0, shrineIdx = 0;
  const buildings = [];
  while (zi < CREEK.zTo - 10) {
    const isShrine = si % 4 === 1;
    const z0 = zi;
    let piece, faceX;
    if (isShrine) {
      piece = shrine({ name: SHRINES[shrineIdx % SHRINES.length], hallW: 12.5, depth: 12, h: 5.2 });
      shrineIdx++;
      faceX = CREEK.northEdge(z0 + piece.hallW / 2) - FACE - LANE - piece.depth / 2 - 2.6;
      piece.group.position.set(faceX, Y, z0 + piece.hallW / 2);
      zi += piece.hallW + 8;
    } else {
      const two = rand() > 0.52;
      const bays = rand() > 0.6 ? 3 : 2;
      piece = shop({ bays, bayW: 4.0, depth: 7.6 + rr(0, 2.6), h: 3.5 + (two ? 0.2 : 0), two, sign: SHOPS[si % SHOPS.length] });
      faceX = CREEK.northEdge(z0 + piece.w / 2) - FACE - LANE - piece.depth / 2;
      piece.group.position.set(faceX, 0, z0 + piece.w / 2);
      zi += piece.w + rr(1.0, 2.6);
    }
    northRow.add(piece.group);
    buildings.push(piece.group);
    // 檐下灯笼沿 z 排开
    const n = Math.max(2, Math.round((isShrine ? 12 : 8) / 4));
    for (let k = 0; k < n; k++) {
      eaveSpots.push([faceX + 0.5, Y + (isShrine ? 5.0 : 4.0), z0 + 2.0 + k * 3.4]);
    }
    si++;
  }
  scene.add(northRow);

  // 南岸：矮一层的河沿屋 + 背街墙
  const southRow = new THREE.Group();
  zi = CREEK.zFrom + 8;
  while (zi < CREEK.zTo - 10) {
    const bays = rand() > 0.7 ? 3 : 2;
    const piece = shop({ bays, bayW: 3.8, depth: 7.0 + rr(0, 2.2), h: 3.2, two: rand() > 0.82, sign: rand() > 0.55 ? SHOPS[(si++ + 4) % SHOPS.length] : '' });
    const e = CREEK.southEdge(zi + piece.w / 2);
    const faceX = e + 1.2 + piece.depth / 2;
    piece.group.position.set(faceX, 0, zi + piece.w / 2);
    piece.group.rotation.y = Math.PI;   // 背面朝河：这一排把街的另一边压住
    southRow.add(piece.group);
    buildings.push(piece.group);
    zi += piece.w + rr(1.2, 3.2);
  }
  scene.add(southRow);

  // 街沿墙线：把两岸的房子和河之间收成一条整齐的岸线
  const kerbN = [], kerbS = [];
  for (let i = 0; i < 84; i++) {
    const z = CREEK.zFrom + ((CREEK.zTo - CREEK.zFrom) * i) / 83;
    kerbN.push(box(0.5, 0.3, (CREEK.zTo - CREEK.zFrom) / 83 - 0.22, CREEK.northEdge(z) - FACE - 0.25, Y + 0.05, z));
    kerbS.push(box(0.5, 0.3, (CREEK.zTo - CREEK.zFrom) / 83 - 0.22, CREEK.southEdge(z) + FACE * 0.6, Y + 0.02, z));
  }
  scene.add(mesh(kerbN, M.stoneDressed));
  scene.add(mesh(kerbS, M.stone));

  const eaveLanterns = lanternRow(scene, eaveSpots);
  const strings = [];
  for (let z = CREEK.zFrom + 14; z < CREEK.zTo - 8; z += 22) {
    const nx = CREEK.northEdge(z) - FACE - LANE, sx = CREEK.southEdge(z) + 1.2;
    strings.push(crossString(scene, new THREE.Vector3(nx, Y + 4.9, z), new THREE.Vector3(sx, Y + 4.5, z + 0.9), 7));
    columns.add(new THREE.Vector3((nx + sx) / 2, 0, z), '#ff9a52', 3.0, 9.2, 1.0, CREEK.waterY);
  }

  const lampSpots = [];
  for (let z = CREEK.zFrom + 10; z < CREEK.zTo; z += 30) lampSpots.push([CREEK.northEdge(z) - FACE - 0.8, z]);
  stoneLamps(scene, lampSpots, columns);

  // 树别长在机位脸上：与任一台相机保持十米
  const nearEye = (x, z) => STATIONS.some((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) < 11);
  treeRow(scene, (() => {
    const s = [];
    for (let z = CREEK.zFrom + 18; z < CREEK.zTo; z += 38) {
      if (rand() > 0.4) {
        const x = CREEK.northEdge(z) - FACE - LANE - 0.4;
        if (!nearEye(x, z)) s.push([x, z + rr(-5, 5), rand() > 0.5 ? 1 : 0.78, Y]);
      }
      if (rand() > 0.6) {
        const x = CREEK.southEdge(z) + 8.2;
        if (!nearEye(x, z)) s.push([x, z + rr(-7, 7), 0.78, Y]);
      }
    }
    return s;
  })());

  const bridges = CREEK.bridges.map((b) => archBridge(scene, b));
  const boats = CREEK.boats.map((b) => boat(scene, b));

  // 街面暖光落进浜里：一条断续的光带
  for (let z = CREEK.zFrom + 6; z < CREEK.zTo; z += 9) {
    const k = 0.62 + 0.34 * Math.sin(z * 0.19);
    columns.add(new THREE.Vector3(CREEK.xAt(z) - CREEK.halfAt(z) * 0.62, 0, z), '#ffab63', 2.1, 8.4, k, CREEK.waterY);
    columns.add(new THREE.Vector3(CREEK.xAt(z) + CREEK.halfAt(z) * 0.62, 0, z), '#ff9a52', 1.8, 7.2, k * 0.86, CREEK.waterY);
  }

  reflections.add(northRow);
  reflections.add(southRow);

  return { root, buildings, bridges, boats, eaveLanterns, strings, mats: useMats() };
}
