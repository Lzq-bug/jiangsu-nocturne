import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, box, mesh, rand, rr } from '../../src/kit.js';
import * as T from '../../src/textures.js';
import { YARD } from './data.js';
import {
  hallBuilding, yardWall, moonDoorWall, corridor, fanPavilion, gardenPavilion,
  rockMass, shadeTree, bambooClump, featureRock, moonWindow, wallCapGeo, stairGeo,
  plaqueMesh,
} from './parts.js';
import { pondOutline } from './water.js';

const HALL_NAME = '二分明月楼';
const GATE_COUPLET = ['春风阆苑三千客', '明月扬州第一楼'];
/** 园北廊壁今存张若虚《春江花月夜》砖刻，这里取其句 */
const POEM_LINES = [
  '春江潮水连海平',
  '海上明月共潮生',
  '滟滟随波千万里',
  '何处春江无月明',
  '可怜楼上月徘徊',
  '应照离人妆镜台',
];
const WELL_INSCRIPTION = '道光七年杏月员置';

/** 院内的碟瓦波文地：整块方地挖掉池子 */
function yardPaving() {
  const hx = YARD.wall.x - 0.35, hz = YARD.wall.z - 0.35;
  const shape = new THREE.Shape();
  shape.moveTo(-hx, -hz);
  shape.lineTo(hx, -hz);
  shape.lineTo(hx, hz);
  shape.lineTo(-hx, hz);
  shape.closePath();
  const pts = pondOutline(56);
  const hole = new THREE.Path();
  pts.forEach((p, i) => (i ? hole.lineTo(p.x, -p.y) : hole.moveTo(p.x, -p.y)));
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 22);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, M.paving);
  m.position.y = 0.02;
  m.receiveShadow = true;
  m.name = 'paving';
  return m;
}

/** 阶条石：从月洞门斜斜铺到楼前 */
function stoneAxis() {
  const grp = new THREE.Group();
  const slab = new THREE.MeshStandardMaterial({
    color: '#b8bec9', map: T.stone('#949aa6'), roughness: 0.9, emissive: '#0c1120', emissiveIntensity: 0.4,
  });
  slab.map = slab.map.clone();
  slab.map.repeat.set(0.3, 0.22);
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = -10.6 + t * 9.4;
    const z = 8.8 - t * 14.2;
    const s = mesh(box(2.1, 0.09, 1.5, x, 0.06, z), slab);
    s.rotation.y = -0.55 + Math.sin(i * 1.7) * 0.05;
    s.receiveShadow = true;
    grp.add(s);
  }
  return grp;
}

/** 园门：石券 + 门扇 + 砖雕门罩 + 石额 + 门联 */
function gateStructure() {
  const grp = new THREE.Group();
  const { x: gx, z: gz, w: gw, h: gh } = YARD.gate;

  const frame = [];
  for (const s of [-1, 1]) frame.push(box(0.42, gh, 0.7, gx + s * (gw / 2 + 0.2), gh / 2, gz));
  frame.push(box(gw + 0.9, 0.36, 0.72, gx, gh + 0.18, gz));
  grp.add(mesh(frame, M.stoneDressed));

  const leaves = [], brass = [];
  for (const s of [-1, 1]) {
    leaves.push(box(gw / 2 - 0.05, gh - 0.32, 0.12, gx + s * gw / 4, (gh - 0.32) / 2 + 0.14, gz));
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const g = new THREE.SphereGeometry(0.045, 6, 5);
        g.translate(gx + s * gw / 4 - 0.3 + c * 0.3, 0.62 + r * 0.62, gz - 0.09);
        brass.push(g);
      }
    }
    const kn = new THREE.TorusGeometry(0.11, 0.03, 6, 14);
    kn.rotateY(Math.PI / 2);
    kn.translate(gx + s * 0.34, gh * 0.52, gz - 0.13);
    brass.push(kn);
  }
  const leafMesh = mesh(leaves, M.woodDark);
  leafMesh.castShadow = true;
  grp.add(leafMesh);
  grp.add(mesh(brass, M.gilt));

  // 砖雕门罩：三层叠涩出檐，上覆小瓦
  const tiers = [];
  for (let i = 0; i < 3; i++) {
    tiers.push(box(gw + 1.5 + i * 0.5, 0.34, 0.5 + i * 0.14, gx, gh + 0.62 + i * 0.36, gz - 0.1));
  }
  const canopy = mesh(tiers, M.brickWarm);
  canopy.castShadow = true;
  grp.add(canopy);
  const cap = new THREE.Mesh(wallCapGeo(gw + 2.9), M.wallCap);
  cap.position.set(gx, gh + 1.78, gz - 0.22);
  grp.add(cap);
  grp.add(mesh(
    Array.from({ length: 5 }, (_, i) => box(0.16, 0.5, 0.16, gx + (i - 2) * 0.62, gh + 0.42, gz - 0.36)),
    M.woodDark,
  ));

  const nameSlab = plaqueMesh(HALL_NAME, 0.78, 2.25, { dir: 'v', bg: '#2b3345', fg: '#e8e2d2', border: '#8f97a8' });
  nameSlab.position.set(gx, gh + 1.05, gz - 0.44);
  grp.add(nameSlab);

  GATE_COUPLET.forEach((text, i) => {
    const p = plaqueMesh(text, 0.52, 2.7, { dir: 'v', bg: '#7d1f1c', fg: '#f0d4a2', border: '#b98a45' });
    p.position.set(gx + (i === 0 ? -1 : 1) * (gw / 2 + 1.0), gh * 0.56, gz - 0.38);
    grp.add(p);
  });
  return grp;
}

/** 院墙四面：南门留洞，东墙与西墙开月形窗 */
function walls() {
  const grp = new THREE.Group();
  const { x: wx, z: wz, h } = YARD.wall;
  const g = YARD.gate;
  const gap = g.w / 2 + 1.25;
  grp.add(yardWall({ from: [-wx, wz], to: [g.x - gap, wz], height: h }));
  grp.add(yardWall({ from: [g.x + gap, wz], to: [wx, wz], height: h }));
  grp.add(yardWall({ from: [-wx, -wz], to: [wx, -wz], height: h + 0.3 }));
  grp.add(yardWall({ from: [-wx, -wz], to: [-wx, wz], height: h }));
  grp.add(yardWall({ from: [wx, -wz], to: [wx, wz], height: h }));

  for (const [z, kind, r] of [[2.2, 'full', 0.72], [8.2, 'crescent', 0.66], [-7.6, 'full', 0.6]]) {
    grp.add(moonWindow({ x: wx - 0.3, y: 2.5, z, r, kind, rotY: Math.PI / 2 }));
  }
  for (const [z, kind, r] of [[-2.4, 'crescent', 0.6], [6.0, 'full', 0.55]]) {
    grp.add(moonWindow({ x: -wx + 0.3, y: 2.4, z, r, kind, rotY: -Math.PI / 2 }));
  }
  grp.add(mesh(box(8, 1.3, 0.16, 3.0, 0.65, -wz + 0.36), M.moss));
  return grp;
}

/** 诗廊：西墙内侧一堵直砖墙，嵌六条《春江花月夜》砖刻 */
function poemWall() {
  const grp = new THREE.Group();
  const x = -12.75;
  const body = mesh(box(0.5, 3.5, 10.4, x, 1.75, 7.2), M.brickWarm);
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);
  grp.add(mesh(box(0.8, 0.22, 10.6, x, 3.6, 7.2), M.wallCap));
  POEM_LINES.forEach((line, i) => {
    const p = plaqueMesh(line, 0.62, 2.5, { dir: 'v', bg: '#3a2f22', fg: '#e7dcc2', border: '#7d6a4c' });
    p.position.set(x + 0.31, 1.95, 11.6 - i * 1.62);
    p.rotation.y = Math.PI / 2;
    grp.add(p);
  });
  return grp;
}

/** 古井：六角井亭 + 井栏刻款 */
function wellStructure() {
  const grp = new THREE.Group();
  const { x, z } = YARD.well;
  const curb = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.62, 6), M.stoneDressed);
  curb.position.set(x, 0.31, z);
  curb.castShadow = true;
  grp.add(curb);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 12), new THREE.MeshStandardMaterial({
    color: '#0a0d14', roughness: 0.6, metalness: 0.1, emissive: '#04060c', emissiveIntensity: 0.4,
  }));
  mouth.position.set(x, 0.62, z);
  grp.add(mouth);
  // 井亭：四柱 + 小攒尖
  // 井亭：矮，四柱，小攒尖，别抢主楼的天际线
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.05, 0.62, 4),
    M.wallCap,
  );
  roof.position.set(x, 1.58, z);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  grp.add(roof);
  const posts = [];
  for (const [dx, dz] of [[0.55, 0.55], [-0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]]) {
    posts.push(new THREE.CylinderGeometry(0.09, 0.1, 1.24, 7).translate(x + dx, 0.62, z + dz));
  }
  grp.add(mesh(mergeGeometries(posts), M.pillar));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.gilt);
  cap.position.set(x, 1.95, z);
  grp.add(cap);

  // 井栏侧壁的刻款：把它读成一块小石板
  const insc = plaqueMesh(WELL_INSCRIPTION, 0.72, 0.5, { dir: 'h', bg: '#818b98', fg: '#22283a', border: '#5d6673' });
  insc.position.set(x, 0.42, z + 0.66);
  insc.rotation.y = 0;
  grp.add(insc);
  return grp;
}

/** 月牙桥：1996 年复建时新设的那座，圆洞合着水里的倒影成一轮满月 */
function crescentBridge() {
  const grp = new THREE.Group();
  const { x, z, rot } = YARD.crescentBridge;
  const span = 2.9, width = 1.05, rise = 0.6, archR = 0.52;
  const shape = new THREE.Shape();
  const hs = span / 2;
  shape.moveTo(-hs, -0.5);
  shape.lineTo(-hs, 0.16);
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    shape.lineTo(-hs + span * t, 0.16 + rise * Math.sin(Math.PI * t));
  }
  shape.lineTo(hs, 0.16);
  shape.lineTo(hs, -0.5);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-archR, -0.46);
  hole.lineTo(-archR, 0.1);
  hole.absarc(0, 0.1, archR, Math.PI, 0, true);
  hole.lineTo(archR, -0.46);
  hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -width / 2);
  const deck = mesh(g, M.stoneDressed);
  deck.castShadow = true; deck.receiveShadow = true;
  grp.add(deck);
  // 栏杆：低栏板 + 两端望柱，桥身不高，栏子别高过人头
  const rails = [];
  const deckAt = (t) => 0.16 + rise * Math.sin(Math.PI * t);
  for (let i = -2; i <= 2; i++) {
    const t = (i + 2) / 4;
    const px = -hs + (span * t);
    const py = deckAt(t);
    for (const s of [-1, 1]) {
      rails.push(box(span / 4.2, 0.26, 0.07, px, py + 0.2, s * width / 2));
      rails.push(box(0.09, 0.44, 0.09, px, py + 0.26, s * width / 2));
    }
  }
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      rails.push(box(0.12, 0.62, 0.12, s * (hs - 0.06), deckAt(s > 0 ? 1 : 0) + 0.34, t * width / 2));
    }
  }
  grp.add(mesh(rails, M.stone));
  grp.position.set(x, YARD.pond.y, z);
  grp.rotation.y = rot;
  return grp;
}

/** 环院的楼、阁、亭：位置照园中格局 */
function flankingBuildings() {
  const grp = new THREE.Group();
  const dongge = hallBuilding({
    bays: 3, bayW: 2.8, depth: 4.2, floors: 1, h1: 3.6, plinth: 0.5,
    porch: 1.3, roofH: 1.6, x: YARD.dongge.x, z: YARD.dongge.z, facing: -Math.PI / 2,
    plaque: '东阁', windows: 0.7, wallMat: M.brickWarm,
  });
  const xizhao = hallBuilding({
    bays: 3, bayW: 2.9, depth: 4.4, floors: 2, h1: 3.3, h2: 2.7, plinth: 0.42,
    porch: 1.1, roofH: 1.55, x: YARD.xizhao.x, z: YARD.xizhao.z, facing: -Math.PI / 2,
    plaque: '夕照', plaqueOpts: { bg: '#1a2a1e', fg: '#efe6c8', note: '集板桥' },
  });
  const yingyue = hallBuilding({
    bays: 3, bayW: 2.9, depth: 4.4, floors: 2, h1: 3.5, h2: 2.9, plinth: 0.42,
    porch: 1.2, roofH: 1.7, x: YARD.yingyue.x, z: YARD.yingyue.z, facing: Math.PI / 2,
    plaque: '迎月', plaqueOpts: { bg: '#10233c' },
  });
  grp.add(dongge, xizhao, yingyue);
  return { grp, hosts: [dongge, xizhao, yingyue] };
}

/* ------------------------------------------------------------------ 组装 */
export function buildGarden(scene) {
  const group = new THREE.Group();
  group.name = 'garden';

  group.add(yardPaving());
  group.add(stoneAxis());
  group.add(walls());
  group.add(gateStructure());
  group.add(poemWall());
  group.add(wellStructure());
  group.add(moonDoorWall({
    x0: YARD.moonWall.x0, x1: YARD.moonWall.x1, z: YARD.moonWall.z,
    cx: YARD.moonWall.cx, r: YARD.moonWall.r, height: YARD.moonWall.h,
  }));

  const hall = hallBuilding({
    bays: YARD.hall.bays, bayW: YARD.hall.bay, depth: YARD.hall.depth, floors: 2,
    h1: 3.9, h2: 3.2, plinth: YARD.hall.plinth, porch: 1.2, roofH: 1.85,
    x: YARD.hall.x, z: YARD.hall.z, facing: 0,
    plaque: HALL_NAME, plaqueOpts: { bg: '#0f2340', fg: '#f2dcae', note: '集钱泳字' },
  });
  group.add(hall);

  const flank = flankingBuildings();
  group.add(flank.grp);

  // 黄石假山在园东，三间东阁依山而筑
  const hill = rockMass({ spread: YARD.rockery.spread, peak: YARD.rockery.peak });
  hill.position.set(YARD.rockery.x, 0, YARD.rockery.z);
  group.add(hill);

  // 扇面亭（梅溪吟榭）探进池里
  const fan = fanPavilion({ backR: 3.4, frontR: 1.7, spread: 1.8, pillarH: 2.6, roofH: 1.55 });
  fan.position.set(YARD.fanPavilion.x, 0, YARD.fanPavilion.z);
  fan.rotation.y = YARD.fanPavilion.rot;
  group.add(fan);

  // 平廊里的伴月亭
  const banyue = gardenPavilion({ sides: 4, radius: 1.7, pillarH: 2.45, roofH: 1.6, plinth: 0.24, openSide: 2 });
  banyue.position.set(YARD.banyue.x, 0, YARD.banyue.z);
  banyue.rotation.y = Math.PI / 2;
  group.add(banyue);
  const banyueSlab = plaqueMesh('伴月', 1.4, 0.52, { dir: 'h', bg: '#22301f', fg: '#efe6c8', note: '集金农' });
  banyueSlab.position.set(YARD.banyue.x, 2.38, YARD.banyue.z + 1.62);
  group.add(banyueSlab);

  // 三条廊：入园的平廊、上楼的爬廊、池北的敞廊
  group.add(corridor({
    points: [[YARD.flatWalk.x, YARD.flatWalk.zFrom], [YARD.flatWalk.x, YARD.flatWalk.zTo]],
    width: 2.3, bayLen: 2.5, height: 2.65,
  }));
  group.add(corridor({
    points: [[-11.4, 3.4], [-11.9, -0.6], [-11.9, -4.2], [-11.0, -7.2]],
    ys: [0, 1.5, 3.0, 4.35], width: 2.1, bayLen: 2.3, height: 2.5,
  }));
  group.add(corridor({
    points: [[-3.0, -2.2], [3.4, -3.6]], width: 2.2, bayLen: 2.4, height: 2.55,
  }));

  group.add(crescentBridge());

  // 植栽：竹在墙角，古木压住东与北，树下点石
  const plants = new THREE.Group();
  for (const [x, z, s] of [[-15.4, 10.6, 1.2], [-15.8, -8.6, 0.95], [15.6, 10.2, 1.0], [2.2, 12.2, 0.8]]) {
    const b = bambooClump({ n: 7 + Math.round(rand() * 5), h: 4.2 * s + rr(0, 1) });
    b.position.set(x, 0, z);
    plants.add(b);
  }
  for (const [x, z, h, blossom] of [[-14.6, -11.0, 5.4, false], [9.2, 11.0, 4.2, true], [-8.4, 0.4, 3.6, false]]) {
    const t = shadeTree({ h, crown: h * 0.36, blossom });
    t.position.set(x, 0, z);
    plants.add(t);
  }
  for (const [x, z, s] of [[1.2, 8.6, 1.0], [-6.2, 1.8, 0.8], [6.4, -5.6, 0.7], [10.2, 2.4, 1.1]]) {
    const r = featureRock(s);
    r.position.set(x, s * 0.25, z);
    plants.add(r);
  }
  // 池里的汀屿：旱园水做的另一笔
  for (const [x, z, s] of [[-2.4, 5.6, 0.75], [4.6, 2.2, 0.6], [0.2, 1.4, 0.5]]) {
    const isle = featureRock(s);
    isle.position.set(x, -0.02, z);
    plants.add(isle);
  }
  group.add(plants);

  // 楼前的台阶
  const steps = stairGeo(4, 0.42, 0.16, 5.2);
  const sm = mesh(steps, M.stoneDressed);
  sm.position.set(0, 0, YARD.hall.z + YARD.hall.depth / 2 + YARD.hall.plinth + 1.6);
  sm.rotation.y = Math.PI;
  group.add(sm);

  scene.add(group);
  group.updateMatrixWorld(true);

  const anchors = [];
  for (const host of [hall, ...flank.hosts, fan, banyue]) {
    for (const lamp of host.userData.lamps || []) {
      const p = lamp.clone().applyMatrix4(host.matrixWorld);
      anchors.push({ p: p.clone(), kind: 'eave' });
      anchors.push({ p: p.clone().setY(p.y - 0.15), kind: 'lantern' });
    }
  }
  return { group, anchors, hall };
}
