import * as THREE from 'three';
import { lit, glow, mesh, box, rand, rr, chineseRoof, registerOccluder, plaqueMesh } from '../kit.js';
import * as T from '../textures.js';
import { RIVER, BRIDGES, ALLEYS } from './data.js';

const Q = RIVER.quayY, HW = RIVER.halfWidth;
/** 河埠位置：驳岸在这里凹下去一段，石阶一级级降到水面 */
const FERRY_Z = [];
for (let z = -88; z <= 88; z += 17) FERRY_Z.push(z);
const NOTCH = 2.0;

/** 粉墙黛瓦：比秦淮冷一档，靠灯把它焐热 */
export const PJ = {};

export function initPJMaterials() {
  PJ.wall = lit('#c3c2b7', { map: T.plaster('#b9b8ac'), rough: 0.96, emissive: '#0b101a', ei: 0.45 });
  PJ.wallInk = lit('#9a9a90', { map: T.plaster('#82827a'), rough: 0.97, emissive: '#090d15', ei: 0.35 });
  PJ.tile = lit('#c6cddc', { map: T.roofTiles('#3a4458', '#505c76', '#8391ad'), rough: 0.8, side: THREE.DoubleSide, emissive: '#0e1420', ei: 0.45 });
  PJ.wood = lit('#6d4832', { map: T.wood('#4b3020', '#2a1810'), rough: 0.7 });
  PJ.woodDark = lit('#412d21', { map: T.wood('#33221a', '#1d1109'), rough: 0.78 });
  PJ.stone = lit('#b2b7c0', { map: T.stone('#9096a0'), rough: 0.9 });
  PJ.stoneWet = lit('#7e8593', { map: T.stone('#666d7a'), rough: 0.55 });
  PJ.flag = lit('#8d9299', { map: T.stone('#757b87'), rough: 0.82 });
  PJ.flag.map = PJ.flag.map.clone();
  PJ.flag.map.repeat.set(9, 62);
  PJ.flag.map.needsUpdate = true;
  PJ.lattice = new THREE.MeshBasicMaterial({ map: T.lattice(6, 5, '#3a2417', '#ffdcae'), color: 0x6b5539, side: THREE.DoubleSide });
  PJ.lattice.toneMapped = false;
  PJ.dark = lit('#171c29', { rough: 0.9 });
  PJ.cloth = lit('#c9c2ae', { rough: 0.9, side: THREE.DoubleSide });
  PJ.bamboo = lit('#3d4433', { rough: 0.85 });
  return PJ;
}

/* ------------------------------------------------------------------ 岸与地面 */
function banks() {
  const stone = [], ground = [];
  for (const s of [-1, 1]) {
    const inner = HW * s;
    // 石驳岸：平江河的岸只比街面高一点，岸顶几乎与街面齐平
    let z = -RIVER.length / 2;
    for (const fz of [...FERRY_Z, RIVER.length / 2]) {
      const last = fz === RIVER.length / 2;
      const z0 = z, z1 = last ? fz : fz - NOTCH;
      if (z1 > z0) {
        const len = z1 - z0, zc = z0 + len / 2;
        const wall = new THREE.BoxGeometry(1.3, Q + 1.45, len);
        wall.translate(inner + s * 0.65, (Q - 1.4) / 2, zc);
        stone.push(wall);
        const cop = new THREE.BoxGeometry(0.6, 0.22, len);
        cop.translate(inner + s * 1.25, Q + 0.02, zc);
        stone.push(cop);
      }
      if (!last) z = fz + NOTCH;
    }
  }
  // 西岸：沿河步道 + 石板街
  ground.push(box(9.4, 0.5, RIVER.length + 40, -(HW + 1.4 + 4.7), Q - 0.25, 0));
  // 东岸：窄河沿 + 巷底
  ground.push(box(6.2, 0.45, RIVER.length + 40, HW + 1.3 + 3.1, Q - 0.22, 0));
  ground.push(box(30, 0.4, 15, HW + 12, Q - 0.2, 0));

  const g = new THREE.Group();
  const quay = mesh(stone, PJ.stone);
  quay.receiveShadow = true;
  const flag = mesh(ground, PJ.flag);
  flag.receiveShadow = true;
  g.add(quay, flag);
  return g;
}

/** 沿河石栏：低、密望柱，桥口和巷口留断缝 */
function railings() {
  const g = new THREE.Group();
  const post = [], rail = [], sill = [];
  const gaps = [...BRIDGES.map((b) => b.z), ...ALLEYS.map((a) => a.z), ...FERRY_Z];
  function run(x, z0, z1) {
    if (z1 - z0 < 1.2) return;
    const len = z1 - z0, n = Math.max(2, Math.round(len / 1.25));
    for (let i = 0; i <= n; i++) {
      const z = z0 + (len * i) / n;
      const p = new THREE.BoxGeometry(0.16, 0.92, 0.16);
      p.translate(x, Q + 0.46, z);
      post.push(p);
      const cap = new THREE.CylinderGeometry(0.11, 0.13, 0.13, 7);
      cap.translate(x, Q + 0.96, z);
      post.push(cap);
    }
    const top = new THREE.BoxGeometry(0.26, 0.1, len);
    top.translate(x, Q + 0.9, (z0 + z1) / 2);
    rail.push(top);
    // 栏板是一整块石头，不是两根横杆：从斜角度看才不会读成木栅栏
    const panel = new THREE.BoxGeometry(0.12, 0.6, len);
    panel.translate(x, Q + 0.5, (z0 + z1) / 2);
    rail.push(panel);
    const base = new THREE.BoxGeometry(0.42, 0.16, len);
    base.translate(x, Q + 0.05, (z0 + z1) / 2);
    sill.push(base);
  }
  for (const s of [-1, 1]) {
    const x = s * (HW + 1.35);
    let z = -RIVER.length / 2;
    const cuts = gaps.filter((gz) => Math.abs(gz) < RIVER.length / 2).sort((a, b) => a - b);
    for (const gz of cuts.concat(RIVER.length / 2 + 1)) {
      run(x, z, gz - 2.2);
      z = gz + 2.2;
    }
  }
  g.add(mesh(post, PJ.stone), mesh(rail, PJ.stoneWet), mesh(sill, PJ.stone));
  return g;
}

/** 河埠：一级级湿石阶下到水面，两头收石笋 */
function quaySteps(anchors) {
  const g = new THREE.Group();
  const steps = [], rams = [];
  for (const s of [-1, 1]) {
    for (const z of FERRY_Z) {
      // 踏步朝水面降：每级 0.7 进深、3.6 宽，正好嵌进驳岸的凹口
      for (let k = 0; k < 5; k++) {
        steps.push(box(0.72, 0.42, 3.6, s * (HW + 1.05 - k * 0.72), Q - 0.5 - k * 0.5, z));
      }
      for (const dz of [-2.1, 2.1]) {
        const r = new THREE.CylinderGeometry(0.16, 0.22, 1.15, 7);
        r.translate(s * (HW + 0.55), Q - 0.35, z + dz);
        rams.push(r);
      }
      anchors.moorRings.push(new THREE.Vector3(s * (HW + 0.5), Q - 0.1, z));
      if (s < 0) anchors.ferryLamps.push(new THREE.Vector3(s * (HW + 1.9), Q + 1.5, z + 1.9));
    }
  }
  g.add(mesh(steps, PJ.stoneWet), mesh(rams, PJ.stone));
  return g;
}

/* ------------------------------------------------------------------ 街屋 */
/** 沿街一栋：面朝 dir 一侧，脊顺着进深方向（山墙朝向街面） */
function houseBlock(zc, frontage, dir, xFace, depth, levels, anchors, opts = {}) {
  const g = new THREE.Group();
  const h = levels === 2 ? rr(6.3, 7.2) : rr(3.4, 4.0);
  const xIn = xFace - dir * depth;
  const cx = (xFace + xIn) / 2;

  g.add(mesh(box(Math.abs(depth), h, frontage, cx, Q + h / 2, zc), levels === 2 ? PJ.wall : PJ.wallInk));
  // 勒脚
  g.add(mesh(box(Math.abs(depth) + 0.14, 0.62, frontage + 0.1, cx, Q + 0.31, zc), PJ.stoneWet));

  // 屋顶：脊沿 X（进深），两坡下水
  const rh = levels === 2 ? 1.15 : 0.86;
  const roof = chineseRoof({
    width: Math.abs(depth) + 0.5, depth: frontage + 0.7, height: rh,
    ridgeRatio: 0.5, curve: 0.35, eaveLift: 0.22, overhang: 0.4, segU: 14, segV: 12, hip: false,
  });
  roof.translate(cx, Q + h, zc);
  const roofMesh = new THREE.Mesh(roof, PJ.tile);
  roofMesh.castShadow = true;
  g.add(roofMesh);
  // 正脊
  g.add(mesh(box(Math.abs(depth) * 0.62, 0.28, 0.32, cx, Q + h + rh + 0.16, zc), PJ.wallInk));

  // 观音兜山墙：垂直于屋脊，封住朝向街面的三角形
  for (const sz of [-1, 1]) {
    const shape = new THREE.Shape();
    const w = Math.abs(depth) / 2;
    shape.moveTo(-w, 0);
    shape.lineTo(-w, rh * 0.18);
    shape.quadraticCurveTo(-w * 0.35, rh * 0.95, 0, rh + 0.22);
    shape.quadraticCurveTo(w * 0.35, rh * 0.95, w, rh * 0.18);
    shape.lineTo(w, 0);
    shape.closePath();
    const geos = new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false });
    geos.translate(cx, Q + h, zc + sz * (frontage / 2 - 0.14));
    g.add(new THREE.Mesh(geos, PJ.wall));
  }

  // 门面：木长窗 + 门洞 + 檐下灯
  const bays = Math.max(1, Math.round(frontage / 3.1));
  const pane = new THREE.PlaneGeometry(1.5, 1.7);
  for (let i = 0; i < bays; i++) {
    const z = zc - frontage / 2 + frontage * (i + 0.5) / bays;
    const litBay = rand() > 0.45;
    const upper = rand() > 0.5;
    // 木框
    g.add(mesh(box(0.24, h * 0.52, frontage / bays * 0.9, xFace + dir * 0.05, Q + h * 0.32, z), PJ.woodDark));
    for (const dz of [-0.62, 0.62]) {
      const w = new THREE.Mesh(pane, litBay ? PJ.lattice : PJ.woodDark);
      w.position.set(xFace + dir * 0.22, Q + h * 0.32, z + dz);
      w.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(w);
      if (litBay) anchors.windows.push(new THREE.Vector3(xFace + dir * 0.5, Q + h * 0.34, z + dz));
    }
    // 檐口下的灯与幌子
    anchors.eaves.push(new THREE.Vector3(xFace + dir * 0.75, Q + h * 0.63, z));
    if (rand() > 0.55) {
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.5), PJ.cloth);
      flag.position.set(xFace + dir * 0.95, Q + h * 0.5, z + 1.0);
      flag.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      flag.rotation.z = rr(-0.06, 0.06);
      g.add(flag);
    }
    if (levels === 2) {
      for (const dz of [-0.62, 0.62]) {
        const w = new THREE.Mesh(pane, upper ? PJ.lattice : PJ.woodDark);
        w.position.set(xFace + dir * 0.22, Q + h * 0.76, z + dz);
        w.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(w);
        if (upper) anchors.windows.push(new THREE.Vector3(xFace + dir * 0.5, Q + h * 0.76, z + dz));
      }
    }
  }
  // 门口石阶
  g.add(mesh(box(0.9, 0.2, 1.5, xFace + dir * 0.55, Q + 0.1, zc), PJ.stone));

  if (opts.sign) {
    const p = plaqueMesh(opts.sign, 1.5, 0.62, { bg: '#1b2436', fg: '#f0d7a8', border: '#9c8354' });
    p.position.set(xFace + dir * 0.3, Q + h * 0.62, zc);
    p.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(p);
  }
  anchors.shopDoors.push(new THREE.Vector3(xFace + dir * 1.1, Q + 0.9, zc));
  return g;
}

function westStreet(anchors) {
  const g = new THREE.Group();
  const xFace = -(HW + 6.4);       // 街面东缘即铺面门墙
  let z = -RIVER.length / 2 + 8;
  const signs = ['茶肆', '评弹', '酒垆', '书铺', '灯肆', '粽铺', '糕团', '酱园', '布庄', '琴行', '伞铺', '砚坊', '桃坞', '绣衣'];
  let k = 0;
  while (z < RIVER.length / 2 - 8) {
    const near = (arr) => arr.some((a) => Math.abs(a.z - z) < 5.5);
    const w = near(BRIDGES) ? 6.2 : rr(6.4, 9.2);
    const levels = rand() > 0.42 ? 2 : 1;
    g.add(houseBlock(z + w / 2, w, 1, xFace, rr(5.6, 7.4), levels, anchors, { sign: signs[k % signs.length] }));
    z += w + (near(ALLEYS) ? 3.4 : rr(0.2, 0.9));
    k++;
  }
  return g;
}

/** 东岸：屋后开门见河，山墙夹出横巷 */
function eastBank(anchors) {
  const g = new THREE.Group();
  const xFace = HW + 5.4;
  const alleyZ = ALLEYS.map((a) => a.z);
  let z = -RIVER.length / 2 + 6;
  while (z < RIVER.length / 2 - 6) {
    const gap = alleyZ.find((az) => Math.abs(az - z) < 6);
    if (gap !== undefined) { z = gap + 7.4; continue; }
    const w = rr(6.8, 10.5);
    const levels = rand() > 0.62 ? 2 : 1;
    g.add(houseBlock(z + w / 2, w, -1, xFace, rr(5.2, 7.0), levels, anchors));
    // 后门的灯
    anchors.doorLamps.push(new THREE.Vector3(xFace - 0.9, Q + 1.9, z + w / 2));
    z += w + rr(0.3, 1.1);
  }
  return g;
}

/** 横巷：两堵高墙把灯挤成一条缝 */
function alleys(anchors) {
  const g = new THREE.Group();
  const x0 = HW + 1.6;
  for (const al of ALLEYS) {
    const hw = al.width / 2;
    const h = rr(4.6, 5.8);
    for (const s of [-1, 1]) {
      const wall = box(al.depth, h, 0.4, x0 + al.depth / 2, Q + h / 2, al.z + s * hw);
      const top = box(al.depth + 0.3, 0.3, 0.86, x0 + al.depth / 2, Q + h + 0.15, al.z + s * hw);
      g.add(mesh([wall, top], PJ.wall));
      // 巷内墙脚的青苔色
      g.add(mesh(box(al.depth, 0.5, 0.44, x0 + al.depth / 2, Q + 0.25, al.z + s * hw), PJ.stoneWet));
      // 瓦檐沿墙走一条
      const eave = box(al.depth + 0.4, 0.16, 1.0, x0 + al.depth / 2, Q + h + 0.42, al.z + s * (hw - 0.3));
      g.add(mesh(eave, PJ.tile));
    }
    // 巷底封墙 + 一扇门
    const endX = x0 + al.depth;
    g.add(mesh(box(0.4, h, al.width + 0.8, endX, Q + h / 2, al.z), PJ.wallInk));
    g.add(mesh(box(0.16, 2.5, 1.2, endX - 0.24, Q + 1.25, al.z), PJ.woodDark));
    anchors.alleyEnd.push(new THREE.Vector3(endX - 0.5, Q + 2.9, al.z));
    // 巷灯：口一盏、中段一盏
    anchors.alleyLamps.push(new THREE.Vector3(x0 + 1.2, Q + 3.0, al.z));
    anchors.alleyLamps.push(new THREE.Vector3(x0 + al.depth * 0.55, Q + 2.6, al.z + rr(-0.4, 0.4)));
    // 巷内石条地
    g.add(mesh(box(al.depth + 1, 0.12, al.width, x0 + al.depth / 2, Q + 0.06, al.z), PJ.stoneWet));
    // 巷口 石库门式 门框
    for (const s of [-1, 1]) {
      g.add(mesh(box(0.5, 3.6, 0.5, x0 + 0.2, Q + 1.8, al.z + s * (hw + 0.35)), PJ.stone));
    }
    g.add(mesh(box(0.62, 0.42, al.width + 1.5, x0 + 0.2, Q + 3.85, al.z), PJ.stone));
  }
  return g;
}

/* ------------------------------------------------------------------ 桥 */
function beamBridge(b, anchors) {
  const g = new THREE.Group();
  const span = (HW + 2.4) * 2, w = 3.0;
  const deckY = Q + 0.5;
  const parts = [];
  // 石梁：三到四根并排
  for (let i = 0; i < 4; i++) {
    parts.push(box(span, 0.5, w / 4 - 0.06, 0, deckY - 0.25, b.z - w / 2 + (i + 0.5) * (w / 4)));
  }
  parts.push(box(span + 0.5, 0.2, w + 0.28, 0, deckY + 0.08, b.z));
  g.add(mesh(parts, PJ.stone));
  // 栏与望柱，中间两块抱鼓石
  for (const s of [-1, 1]) {
    const z = b.z + s * (w / 2 + 0.06);
    const rail = [];
    for (let i = 0; i <= 6; i++) {
      const x = -span / 2 + (span * i) / 6;
      const p = new THREE.BoxGeometry(0.15, 0.72, 0.15);
      p.translate(x, deckY + 0.44, z);
      rail.push(p);
    }
    const bar = new THREE.BoxGeometry(span, 0.12, 0.18);
    bar.translate(0, deckY + 0.75, z);
    rail.push(bar);
    g.add(mesh(rail, PJ.stone));
    const drum = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12);
    drum.rotateZ(Math.PI / 2);
    for (const e of [-1, 1]) {
      const d = drum.clone();
      d.translate(e * (span / 2 - 0.1), deckY + 0.42, z);
      g.add(new THREE.Mesh(d, PJ.stoneWet));
    }
    anchors.bridgeLamps.push(new THREE.Vector3(span / 2 - 0.4, deckY + 1.4, z));
  }
  // 桥头石阶
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      g.add(mesh(box(0.75, 0.3, w + 0.3, s * (span / 2 + 0.4 + k * 0.7), deckY - 0.3 - k * 0.32, b.z), PJ.stone));
    }
  }
  return g;
}

/* 拱桥：半圆券 + 随拱起翘的桥面，倒影补成一轮月 */
const ARCH = { R: HW + 0.6, spring: 0.8, half: HW + 3.2, w: 3.4, z: (BRIDGES.find((b) => b.kind === 'arch') || { z: 0 }).z };
const archCrown = ARCH.spring + ARCH.R + 0.5;
/** 桥面标高：券顶之上 0.5 米，出券之后直线落到桥头 */
export function archDeckY(x) {
  const a = Math.abs(x);
  if (a <= ARCH.R) return ARCH.spring + Math.sqrt(ARCH.R * ARCH.R - a * a) + 0.5;
  const k = (a - ARCH.R) / (ARCH.half - ARCH.R);
  return archCrown - k * (archCrown - (Q + 0.3));
}

function archBridge(b, anchors) {
  const g = new THREE.Group();
  const { R, spring, half, w } = ARCH;
  for (const s of [-1, 1]) {
    g.add(new THREE.Mesh(archCheekGeo(half, R, spring, archDeckY, b.z + s * (w / 2) - 0.21), PJ.stoneWet));
  }
  // 券脸石箍
  const arc = [];
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI * (i / 26);
    arc.push(new THREE.Vector3(Math.cos(a) * R, spring + Math.sin(a) * R, 0));
  }
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 30, 0.24, 6, false), PJ.stone);
  band.scale.z = w / 0.48;
  band.position.z = b.z;
  g.add(band);

  // 桥面、望柱与栏板都沿同一条起拱线走
  const deck = [], post = [], railParts = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const x = -half + (2 * half * i) / N;
    const y = archDeckY(x);
    if (i > 0) {
      const x0 = -half + (2 * half * (i - 1)) / N, y0 = archDeckY(x0);
      const len = Math.hypot(x - x0, y - y0) + 0.08;
      const ang = Math.atan2(y - y0, x - x0);
      const geo = box(len, 0.36, w, (x + x0) / 2, (y + y0) / 2 + 0.18, b.z);
      geo.rotateZ(ang);
      deck.push(geo);
      if (i % 3 === 0) {
        for (const s of [-1, 1]) {
          const p = new THREE.BoxGeometry(0.17, 0.86, 0.17);
          p.translate((x + x0) / 2, (y + y0) / 2 + 0.75, b.z + s * (w / 2));
          post.push(p);
          const bar = box(len, 0.46, 0.13, (x + x0) / 2, (y + y0) / 2 + 0.62, b.z + s * (w / 2));
          bar.rotateZ(ang);
          railParts.push(bar);
        }
      }
    }
  }
  g.add(mesh(deck, PJ.stone), mesh(post, PJ.stone), mesh(railParts, PJ.stoneWet));

  // 桥头两级踏步 + 桥灯
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      g.add(mesh(box(0.7, 0.26, w + 0.2, s * (half + 0.35 + k * 0.66), Q + 0.16 - k * 0.28, b.z), PJ.stone));
    }
    anchors.bridgeLamps.push(new THREE.Vector3(s * (half + 1.1), Q + 1.7, b.z - w / 2 + 0.2));
    anchors.bridgeLamps.push(new THREE.Vector3(s * (half + 1.1), Q + 1.7, b.z + w / 2 - 0.2));
  }
  anchors.archLamps.push(new THREE.Vector3(0, archCrown + 0.55, b.z));
  return g;
}

/** 拱桥侧墙：外轮廓随桥面起拱，中间挖一个半圆洞 */
function archCheekGeo(half, R, springY, topAt, z) {
  const sh = new THREE.Shape();
  sh.moveTo(-half, -0.9);
  for (let i = 0; i <= 30; i++) {
    const x = -half + (2 * half * i) / 30;
    sh.lineTo(x, topAt(x));
  }
  sh.lineTo(half, -0.9);
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, springY, R, Math.PI, 0, true);
  hole.lineTo(-R, springY);
  sh.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: false, curveSegments: 26 });
  geo.translate(0, 0, z);
  return geo;
}

/* ------------------------------------------------------------------ 街口石牌 */
function streetGate(anchors) {
  const g = new THREE.Group();
  const x = -(HW + 4.4), z = 52, w = 9.0, h = 4.6;
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(0.72, h, 0.72, x, Q + h / 2, z + s * (w / 2)));
    parts.push(box(1.25, 0.4, 1.25, x, Q + 0.2, z + s * (w / 2)));
  }
  parts.push(box(0.86, 0.62, w + 1.2, x, Q + h + 0.3, z));
  g.add(mesh(parts, PJ.stone));
  const lintel = box(0.7, 0.9, w - 0.4, x, Q + h - 0.55, z);
  g.add(mesh(lintel, PJ.wallInk));
  const roof = chineseRoof({ width: 2.2, depth: w + 1.4, height: 0.8, ridgeRatio: 0.5, curve: 0.5, eaveLift: 0.5, overhang: 0.3, segU: 12, segV: 10 });
  roof.rotateY(Math.PI / 2);
  roof.translate(x, Q + h + 0.62, z);
  g.add(new THREE.Mesh(roof, PJ.tile));
  const p = plaqueMesh('平江路', 1.9, 0.72, { bg: '#15243b', fg: '#f4dfae', border: '#b09258' });
  p.position.set(x, Q + h + 0.16, z + 0.26);
  const pBack = plaqueMesh('古平江里', 1.9, 0.72, { bg: '#15243b', fg: '#f4dfae', border: '#b09258' });
  pBack.position.set(x, Q + h + 0.16, z - 0.26);
  pBack.rotation.y = Math.PI;
  g.add(p, pBack);
  anchors.gate.push(new THREE.Vector3(x, Q + h - 0.3, z - w / 2 + 0.4));
  anchors.gate.push(new THREE.Vector3(x, Q + h - 0.3, z + w / 2 - 0.4));
  return registerOccluder(g, 2.4, new THREE.Vector3(x, Q + 2, z));
}

/** 街面上零碎的生活道具：竹椅、木桶、盆栽 */
function streetFurniture() {
  const g = new THREE.Group();
  const legs = [], pots = [], tubs = [], seats = [];
  for (let z = -78; z <= 78; z += 6) {
    if (rand() > 0.5) continue;
    const x = -(HW + 2.6) - rr(0, 1.2);
    if (!stationClear(x, z)) continue;
    if (rand() > 0.5) {
      seats.push(box(0.62, 0.1, 0.62, x, Q + 0.42, z), box(0.62, 0.7, 0.09, x, Q + 0.75, z - 0.26));
      for (const sx of [-0.24, 0.24]) for (const sz of [-0.24, 0.24]) {
        legs.push(box(0.07, 0.42, 0.07, x + sx, Q + 0.21, z + sz));
      }
    } else {
      const t = new THREE.CylinderGeometry(0.36, 0.3, 0.5, 10);
      t.translate(x, Q + 0.25, z);
      tubs.push(t);
    }
  }
  for (let z = -70; z <= 70; z += 9) {
    for (const s of [-1, 1]) {
      if (rand() > 0.55) continue;
      const x = s * (HW + 1.9);
      if (!stationClear(x, z)) continue;
      const pot = new THREE.CylinderGeometry(0.26, 0.2, 0.42, 9);
      pot.translate(x, Q + 0.21, z);
      pots.push(pot);
    }
  }
  if (seats.length) g.add(mesh(seats, PJ.bamboo));
  if (legs.length) g.add(mesh(legs, PJ.bamboo));
  if (pots.length) g.add(mesh(pots, PJ.stoneWet));
  if (tubs.length) g.add(mesh(tubs, PJ.woodDark));
  return g;
}

/* ------------------------------------------------------------------ 路灯 */
function lampRow(anchors) {
  const g = new THREE.Group();
  for (let z = -84; z <= 84; z += 9.5) {
    const x = -(HW + 2.0);
    const pole = new THREE.CylinderGeometry(0.075, 0.12, 3.9, 7);
    pole.translate(x, Q + 1.95, z);
    const arm = box(0.75, 0.09, 0.09, x + 0.34, Q + 3.85, z);
    const base = new THREE.CylinderGeometry(0.2, 0.26, 0.34, 9);
    base.translate(x, Q + 0.17, z);
    const hood = box(0.44, 0.2, 0.44, x + 0.68, Q + 3.8, z);
    const post = mesh([pole, arm, base, hood], PJ.dark);
    g.add(registerOccluder(post, 2.0, new THREE.Vector3(x, Q + 2, z)));
    // 灯头：暖白一点，独立于灯杆，走近了也不会一起消失
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.34), glow('#ffe3ae', 1.9));
    bulb.position.set(x + 0.68, Q + 3.62, z);
    g.add(bulb);
    anchors.lampPosts.push(new THREE.Vector3(x + 0.68, Q + 3.58, z));
  }
  // 东岸河沿的石灯幢，矮一档
  for (let z = -66; z <= 66; z += 22) {
    const x = HW + 1.75;
    const shaft = new THREE.CylinderGeometry(0.13, 0.17, 1.7, 8);
    shaft.translate(x, Q + 0.85, z);
    const cap = new THREE.ConeGeometry(0.34, 0.4, 6);
    cap.translate(x, Q + 1.95, z);
    g.add(mesh([shaft, cap], PJ.stone));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), glow('#ffd9a2', 1.7));
    lamp.position.set(x, Q + 1.62, z);
    g.add(lamp);
    anchors.quayLamps.push(new THREE.Vector3(x, Q + 1.6, z));
  }
  return g;
}

/** 别让道具与路灯长在机位上 */
const STATION_BLOCK = [];
function stationClear(x, z) {
  return STATION_BLOCK.every(([bx, bz]) => Math.hypot(bx - x, bz - z) > 3.2);
}

/** 跨河灯串：一盏盏红灯笼悬在河心，"灯河"就靠这几根线落到水面上 */
function crossStrings(anchors) {
  const bridgeZ = BRIDGES.map((b) => b.z), alleyZ = ALLEYS.map((a) => a.z);
  const near = (z, list, r) => list.some((v) => Math.abs(v - z) < r);
  for (let z = -84; z <= 84; z += 7.5) {
    if (near(z, bridgeZ, 3.4) || near(z, alleyZ, 2.6)) continue;
    const y = Q + rr(2.0, 2.6);
    anchors.stringEnds.push([
      new THREE.Vector3(-(HW + 0.6), y, z),
      new THREE.Vector3(HW + 0.6, y, z + rr(-0.5, 0.5)),
    ]);
  }
}

/* ------------------------------------------------------------------ assemble */
export function buildQuarter(scene, stationPoses) {
  const anchors = {
    lampPosts: [], eaves: [], windows: [], doorLamps: [], alleyLamps: [], alleyEnd: [],
    bridgeLamps: [], archLamps: [], quayLamps: [], ferryLamps: [], shopDoors: [],
    moorRings: [], stringEnds: [], gate: [],
  };
  STATION_BLOCK.length = 0;
  for (const st of stationPoses) STATION_BLOCK.push([st.pos[0], st.pos[2]]);

  const group = new THREE.Group();
  group.name = 'pingjiang';
  group.add(banks(), railings(), quaySteps(anchors));
  group.add(westStreet(anchors), eastBank(anchors), alleys(anchors));
  for (const b of BRIDGES) group.add(b.kind === 'arch' ? archBridge(b, anchors) : beamBridge(b, anchors));
  group.add(streetGate(anchors), lampRow(anchors), streetFurniture());
  crossStrings(anchors);
  scene.add(group);
  return { group, anchors };
}
