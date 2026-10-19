import * as THREE from 'three';
import {
  M, hall, pavilion, fanHall, latticeWall, moonGateWall,
  coveredBridge, stoneBoat, rockPeak, hill, bambooClump, plantain, tree,
  box, chineseRoof, railingGeo, terraceGeo, plaqueMesh, rand, rr,
} from './kit.js';
import { SITE, ISLANDS } from './data.js';
import * as T from './textures.js';

/**
 * 全园建筑与构筑物的落位。坐标一律来自这里，机位在 data.js 里对齐它。
 * 分区：南部宅园（李宅）→ 东园 → 中园 → 复廊 → 西园（补园）。
 * 返回的 anchors 给 props 布灯、给 show 找投影面。
 */
export const LAYOUT = {
  lizhai: { hall: [80, 45], gate: [80, 66], screen: [80, 41.4] },
  lanxue: { hall: [64, 28] },
  corridor: [[68, 49], [58, 48], [48, 46], [40, 44], [34, 41], [28, 38]],
  yuanxiang: { hall: [16, 31] },
  feihong: { bridge: [29, 14] },
  hefeng: { pav: [-6, -2] },
  xiangzhou: { boat: [-16, -8], yaw: 2.36 },
  wuzhu: { pav: [32, 0] },
  tingyu: { hall: [36, 44] },
  yushui: { fan: [-46, 12] },
  yuanyang: { hall: [-68, -14] },
  liuting: { pav: [-74, 30] },
  jianshan: { lou: [-8, -38] },
  xuexiang: { pav: [-20, -30] },
  taoying: { pav: [-96, -6] },
  fucui: { pav: [-98, 18] },
  yiliang: { pav: [-44, 26] },
  daoying: { lou: [-92, 2] },
  furong: { xie: [50, 36.5] },
  tianquan: { pav: [58, 41] },
  shuxiang: { hall: [76, 34] },
  pipa: { ban: [46, 40] },
  relay: [[-40, 20], [-41, 8], [-41, -4], [-40, -14]],
};

/* ------------------------------------------------------------------ helpers */

function place(obj, x, z, yaw = 0, y = SITE.groundY) {
  obj.position.set(x, y, z);
  obj.rotation.y = yaw;
  return obj;
}

/** 朝向角：+X 东、+Z 南。给定"面向"的方向向量返回 yaw */
function yawTo(dx, dz) { return Math.atan2(dx, dz); }

/** 一段游廊：沿折点串起来，柱 + 卷棚顶 + 单侧或双侧栏板 */
function corridorRun(points, { width = 2.6, height = 2.7, roofH = 0.9, walls = 'none' } = {}) {
  const grp = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const seg = new THREE.Group();
    const n = Math.max(2, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) {
      const x = -len / 2 + (len * k) / n;
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, height, 8), M.pillar);
        p.position.set(x, height / 2, s * (width / 2 - 0.12));
        seg.add(p);
      }
      if (k < n) {
        const step = len / n;
        for (const s of [-1, 1]) {
          const b = new THREE.Mesh(box(step * 0.94, 0.2, 0.16, 0, height, s * (width / 2 - 0.12)), M.beam);
          seg.add(b);
        }
      }
    }
    // 廊地面
    const floor = new THREE.Mesh(box(len, 0.14, width - 0.3, 0, 0.07, 0), M.stoneDressed);
    seg.add(floor);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(railingGeo(len - 0.3, { height: 0.66, spacing: 1.7 }), M.stone);
      r.position.set(0, 0.14, s * (width / 2 - 0.16));
      seg.add(r);
    }
    // 卷棚顶：一整段双坡弧脊盖过去，别用三块板拼
    const roof = new THREE.Mesh(
      chineseRoof({ width: len + 0.6, depth: width + 1.4, height: roofH, hip: false, overhang: 0.24, curve: 0.3, eaveLift: 0.25, segU: 10, segV: 10 }),
      M.roofRoll);
    roof.position.set(0, height + 0.12, 0);
    seg.add(roof);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, len + 0.7, 8), M.roofDark);
    ridge.rotateZ(Math.PI / 2);
    ridge.position.set(0, height + roofH + 0.16, 0);
    seg.add(ridge);
    if (walls === 'both' || walls === 'south') {
      for (const s of walls === 'both' ? [-1, 1] : [1]) {
        const w = latticeWall({ length: len * 0.98, height: height * 0.92, openings: Math.max(1, Math.round(len / 4.2)) });
        w.position.set(0, 0.14, s * (width / 2 + 0.1));
        w.rotation.y = s > 0 ? Math.PI : 0;
        seg.add(w);
      }
    }
    seg.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    seg.rotation.y = -ang;
    grp.add(seg);
  }
  grp.children.forEach((c) => { c.position.y = SITE.groundY - 0.06; });
  return grp;
}

/** 园墙：沿折线走一段夯土粉墙，上覆瓦顶，偶开漏窗 */
function wallRun(points, { height = 3.4, gates = [] } = {}) {
  const grp = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const seg = new THREE.Group();
    const body = new THREE.Mesh(box(len, height, 0.5, 0, height / 2, 0), M.wall);
    seg.add(body);
    const cap = new THREE.Mesh(box(len + 0.3, 0.24, 0.9, 0, height + 0.12, 0), M.roofDark);
    seg.add(cap);
    const tile = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.16, 1.2), M.roof);
    tile.position.set(0, height + 0.3, 0);
    seg.add(tile);
    const open = Math.max(1, Math.round(len / 12));
    for (let k = 1; k <= open; k++) {
      const x = -len / 2 + (len * k) / (open + 1);
      const core = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), M.lattice);
      core.position.set(x, height * 0.62, 0.27);
      seg.add(core);
    }
    for (const g of gates) {
      const t = (g[0] - x0) / (x1 - x0 || 1);
      if (t > 0 && t < 1 && Math.abs(g[1] - z0) < 8) {
        const door = new THREE.Mesh(box(2.6, height * 0.8, 0.6, 0, height * 0.4, 0), M.pillarDark);
        door.position.set(-len / 2 + len * t, 0, 0);
        seg.add(door);
      }
    }
    seg.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    seg.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    grp.add(seg);
  }
  grp.children.forEach((c) => { c.position.y = 0; });
  return grp;
}

/** 石板堤 / 曲桥：一块块条石贴着水面过去 */
function causeway(points, { y = 0.3, width = 1.5 } = {}) {
  const grp = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 1.1));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const slab = new THREE.Mesh(box(width * 0.92, 0.16, (len / n) * 0.86, 0, 0, 0), M.stoneDressed);
      slab.position.set(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t);
      slab.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      grp.add(slab);
    }
  }
  return grp;
}

/** 白墙围出的小院（枇杷园一类）：三面墙 + 一面漏窗 + 半亭 */
function walledGarden({ x, z, yaw = 0, w = 14, d = 12, wallH = 3.2 }) {
  const grp = new THREE.Group();
  const back = new THREE.Mesh(box(w, wallH, 0.4, 0, wallH / 2, -d / 2), M.wall);
  const l = new THREE.Mesh(box(0.4, wallH, d, -w / 2, wallH / 2, 0), M.wall);
  const r = new THREE.Mesh(box(0.4, wallH, d, w / 2, wallH / 2, 0), M.wall);
  for (const m of [back, l, r]) grp.add(m);
  for (const m of [back, l, r]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(m.geometry.parameters.width + 0.3, 0.2, m.geometry.parameters.depth + 0.3), M.roofDark);
    cap.position.set(m.position.x, wallH + 0.1, m.position.z);
    grp.add(cap);
  }
  const front = latticeWall({ length: w, height: wallH * 0.92, openings: 3 });
  front.position.set(0, 0, d / 2);
  front.rotation.y = Math.PI;
  grp.add(front);
  grp.position.set(x, 0, z);
  grp.rotation.y = yaw;
  return grp;
}

/** 门厅：宅园的第一张脸，台门 + 砖雕檐 + 匾 */
function gateHouse({ w = 9, d = 5, h = 4.2, plaque = null }) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(box(w, h, d, 0, h / 2, 0), M.wall);
  grp.add(body);
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(box(0.5, h * 1.02, 0.5, s * (w / 2 - 0.6), h * 0.51, d / 2), M.pillarDark);
    grp.add(pil);
  }
  const door = new THREE.Mesh(box(2.8, h * 0.62, 0.3, 0, h * 0.31, d / 2 - 0.05), M.pillarDark);
  grp.add(door);
  const lintel = new THREE.Mesh(box(w * 0.98, 0.5, 0.7, 0, h * 0.66, d / 2), M.beam);
  grp.add(lintel);
  const roof = new THREE.Mesh(chineseRoof({ width: w, depth: d, height: 1.5, overhang: 0.6, ridgeRatio: 0.36 }), M.roofDark);
  roof.position.y = h + 0.1;
  grp.add(roof);
  if (plaque) {
    const p = plaqueMesh(plaque, w * 0.34, 0.8);
    p.position.set(0, h * 0.78, d / 2 + 0.3);
    grp.add(p);
  }
  const steps = new THREE.Mesh(terraceGeo({ w: w * 0.7, d: 2.2, h: 0.24, steps: false }), M.step);
  steps.position.set(0, 0.12, d / 2 + 1.1);
  grp.add(steps);
  return grp;
}

/** 楼（见山楼、留听阁、倒影楼一类）：两层，上下都开长窗 */
function tower({ w = 10, d = 8, h1 = 4.4, h2 = 3.6, roofH = 2.4, plaque = null }) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(terraceGeo({ w: w + 1.2, d: d + 1.2, h: 0.6, steps: true }), M.step);
  grp.add(base);
  const lower = new THREE.Mesh(box(w, h1, d, 0, 0.6 + h1 / 2, 0), M.wall);
  grp.add(lower);
  for (let i = 0; i <= 3; i++) {
    const x = -w / 2 + (w * i) / 3;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, h1, 8), M.pillar);
    p.position.set(x, 0.6 + h1 / 2, d / 2 + 0.05);
    grp.add(p);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w / 3 * 0.72, h1 * 0.6), M.lattice);
    win.position.set(x - w / 6, 0.6 + h1 * 0.48, d / 2 + 0.14);
    grp.add(win);
  }
  const skirt = new THREE.Mesh(box(w + 0.9, 0.3, d + 0.9, 0, 0.6 + h1 + 0.15, 0), M.beam);
  grp.add(skirt);
  const lowRoof = new THREE.Mesh(chineseRoof({ width: w + 0.6, depth: d + 0.6, height: 1.5, overhang: 0.7, ridgeRatio: 0.3 }), M.roof);
  lowRoof.position.y = 0.6 + h1 + 0.3;
  grp.add(lowRoof);
  const upper = new THREE.Mesh(box(w * 0.84, h2, d * 0.84, 0, 0.6 + h1 + 1.4 + h2 / 2, 0), M.wall);
  grp.add(upper);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h2 * 0.6), M.lattice);
    win.position.set(0, 0.6 + h1 + 1.4 + h2 * 0.48, s * (d * 0.42 + 0.12));
    win.rotation.y = s > 0 ? 0 : Math.PI;
    grp.add(win);
  }
  const rail = new THREE.Mesh(railingGeo(w * 0.9, { height: 0.72 }), M.stone);
  rail.position.set(0, 0.6 + h1 + 0.5, d / 2 + 0.5);
  grp.add(rail);
  const top = new THREE.Mesh(chineseRoof({ width: w * 0.95, depth: d * 0.95, height: roofH, overhang: 0.6, ridgeRatio: 0.36 }), M.roof);
  top.position.y = 0.6 + h1 + 1.4 + h2;
  grp.add(top);
  if (plaque) {
    const p = plaqueMesh(plaque, w * 0.3, 0.7);
    p.position.set(0, 0.6 + h1 * 0.72, d / 2 + 0.25);
    grp.add(p);
  }
  return grp;
}

/** 水榭：一面挑出水面的平台 + 开敞的轩 */
function waterside({ w = 10, d = 6, h = 3.4 }) {
  const grp = new THREE.Group();
  const deck = new THREE.Mesh(box(w + 2.4, 0.3, d + 3.4, 0, 0.5, 0.6), M.stoneDressed);
  grp.add(deck);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + (w * i) / 3;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.2, 8), M.pillarDark);
    post.position.set(x, -0.1, d / 2 + 1.8);
    grp.add(post);
  }
  const body = hall({ w, d, wallH: h, baysX: 3, baysZ: 1, roofH: 1.9, terrace: 0.5, openFront: true, openBack: false, openSides: true });
  body.position.y = 0.64;
  grp.add(body);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(railingGeo(w + 2.2, { height: 0.7 }), M.stone);
    r.position.set(0, 0.65, s * (d / 2 + 2.0));
    grp.add(r);
  }
  return grp;
}

/* ------------------------------------------------------------------ assemble */

export function buildQuarter(scene) {
  const group = new THREE.Group();
  group.name = 'quarter';
  const anchors = [];
  const add = (obj, x, z, yaw = 0, y = SITE.groundY) => {
    place(obj, x, z, yaw, y);
    group.add(obj);
    anchors.push({ obj, x, z, yaw });
    return obj;
  };

  /* ---------------- 南部宅园（李宅） */
  const gate = gateHouse({ w: 10, d: 5, h: 4.4, plaque: '拙政园' });
  add(gate, 80, 66, 0);
  const gateWall = wallRun([[62, 68], [72, 67], [80, 68], [88, 67], [92, 66]], { height: 3.6 });
  group.add(gateWall);
  // 仪门：一堵白墙开月洞，退到院子南端，别堵着看厅的视线
  const yi = new THREE.Group();
  const moonA = moonGateWall({ width: 9, height: 4.0, r: 1.45 });
  const moonB = moonGateWall({ width: 7, height: 3.6, r: 1.2 });
  moonB.position.set(7.5, 0, 0.6);
  moonB.rotation.y = Math.PI / 2;
  yi.add(moonA, moonB);
  add(yi, 80, 59, 0);

  const huiket = hall({
    w: 13.5, d: 8, wallH: 4.6, baysX: 4, baysZ: 2, roofH: 2.5, terrace: 0.6,
    openFront: true, openBack: false, openSides: false, plaque: '会客厅',
  });
  add(huiket, ...LAYOUT.lizhai.hall, 0);
  // 画屏：会客厅正对的一面墙，光影秀把月与水波打在这里
  const screenWall = new THREE.Group();
  const sw = new THREE.Mesh(box(9.2, 4.2, 0.35, 0, 2.1, 0), M.wall);
  const painting = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.4),
    new THREE.MeshBasicMaterial({ map: T.inkPainting(), toneMapped: false }));
  painting.position.set(0, 2.25, 0.2);
  const pFrame = new THREE.Mesh(box(8.1, 3.8, 0.12, 0, 2.25, 0.1), M.pillarDark);
  screenWall.add(sw, painting, pFrame);
  add(screenWall, ...LAYOUT.lizhai.screen, 0);

  const zhaiWall = wallRun([[68, 52], [74, 41], [86, 41], [92, 52]], { height: 3.4 });
  group.add(zhaiWall);

  /* ---------------- 东园 */
  const lanxue = hall({
    w: 11, d: 7, wallH: 4.2, baysX: 3, baysZ: 2, roofH: 2.2, terrace: 0.55,
    openFront: true, openSides: false, plaque: '兰雪堂',
  });
  add(lanxue, ...LAYOUT.lanxue.hall, yawTo(-1, 0));
  // 缀云峰当路如屏风
  const peak = new THREE.Group();
  for (const [dx, dz, h, r] of [[0, 0, 6.4, 1.5], [2.2, 0.6, 4.2, 1.1], [-2.0, 0.9, 3.4, 1.0], [0.6, 1.6, 2.6, 0.9]]) {
    const p = rockPeak({ h, r });
    p.position.set(dx, 0, dz);
    peak.add(p);
  }
  add(peak, 68, 20, 0.4);
  const bambooA = bambooClump({ count: 16, height: 5.2, radius: 2.4 });
  add(bambooA, 71, 24, 0);
  const bambooB = bambooClump({ count: 12, height: 4.6, radius: 2.0 });
  add(bambooB, 62, 21, 0);

  const furong = waterside({ w: 9, d: 5, h: 3.4 });
  add(furong, ...LAYOUT.furong.xie, yawTo(0, -1));
  const tianquan = pavilion({ shape: 'square', size: 4.6, height: 3.1, roofH: 1.6 });
  add(tianquan, ...LAYOUT.tianquan.pav, 0);
  const shuxiang = hall({ w: 13, d: 6.5, wallH: 4.0, baysX: 4, baysZ: 1, roofH: 2.1, terrace: 0.5, openFront: true, plaque: '秫香馆' });
  add(shuxiang, ...LAYOUT.shuxiang.hall, yawTo(-1, 0));

  /* ---------------- 光影长廊 + 枇杷园 */
  const lang = corridorRun(LAYOUT.corridor, { width: 3.0, height: 2.9, walls: 'south' });
  group.add(lang);
  const pipa = walledGarden({ x: 44, z: 56, yaw: 0, w: 14, d: 10 });
  group.add(pipa);
  const banTing = pavilion({ shape: 'hex', size: 3.8, height: 2.9, roofH: 1.5 });
  add(banTing, ...LAYOUT.pipa.ban, 0, SITE.groundY + 0.1);

  /* ---------------- 中园 */
  const yuanxiang = hall({
    w: 15, d: 9, wallH: 4.8, baysX: 5, baysZ: 2, roofH: 2.8, terrace: 0.7,
    openFront: true, openBack: true, openSides: false, plaque: '远香堂',
    latticeKind: 'lattice',
  });
  add(yuanxiang, ...LAYOUT.yuanxiang.hall, yawTo(0, -1));
  // 厅前平台伸到水边，站在这里看一池荷
  const front = new THREE.Mesh(box(19, 0.3, 5.4), M.step);
  front.position.set(16, SITE.groundY + 0.55, 23.4);
  front.receiveShadow = true;
  group.add(front);

  const tingyu = hall({
    w: 9, d: 6, wallH: 3.9, baysX: 3, baysZ: 1, roofH: 2.0, terrace: 0.5,
    openFront: true, openSides: false, plaque: '听雨轩',
  });
  add(tingyu, ...LAYOUT.tingyu.hall, yawTo(-1, 0));
  const bananaA = plantain({ count: 7, height: 3.4 });
  add(bananaA, 31.6, 40.4, 0);
  const bananaB = plantain({ count: 5, height: 3.0 });
  add(bananaB, 32.2, 47.6, 0);

  const feihong = coveredBridge({ length: 15, width: 3.6, deckY: 0.62, segments: 3, roofH: 1.6, houseLen: 5.4 });
  add(feihong, ...LAYOUT.feihong.bridge, Math.PI / 2, 0);
  const damA = causeway([[20, 27.4], [24, 22], [26.4, 17.6]], { y: 0.42, width: 1.7 });
  group.add(damA);

  const hefeng = pavilion({ shape: 'square', size: 5.4, height: 3.4, roofH: 1.9, terrace: 0.5 });
  add(hefeng, ...LAYOUT.hefeng.pav, 0.2, ISLANDS[0].y + 0.02);
  const damB = causeway([[-6, 4.2], [-4, 8], [2, 12], [8, 16]], { y: 0.4, width: 1.5 });
  group.add(damB);

  const boat = stoneBoat({ length: 15.5, width: 3.6, height: 1.05, cabin: true, tower: true });
  add(boat, ...LAYOUT.xiangzhou.boat, LAYOUT.xiangzhou.yaw, 0.05);
  const damC = causeway([[-24, -22], [-21, -16], [-18.6, -11.6], [-16.8, -9]], { y: 0.4, width: 1.6 });
  group.add(damC);

  const wuzhu = new THREE.Group();
  const wp = pavilion({ shape: 'square', size: 5.6, height: 3.4, roofH: 1.8, terrace: 0.45 });
  wuzhu.add(wp);
  for (const [dx, dz, yaw] of [[0, 3.1, 0], [0, -3.1, Math.PI], [3.1, 0, Math.PI / 2], [-3.1, 0, -Math.PI / 2]]) {
    const mg = moonGateWall({ width: 5.9, height: 3.3, r: 1.3, thickness: 0.36 });
    mg.position.set(dx, 0.45, dz);
    mg.rotation.y = yaw;
    wuzhu.add(mg);
  }
  add(wuzhu, ...LAYOUT.wuzhu.pav, 0);

  const jianshan = tower({ w: 10.5, d: 8, h1: 4.4, h2: 3.6, plaque: '见山楼' });
  add(jianshan, ...LAYOUT.jianshan.lou, yawTo(0, 1));
  const hillN = hill({ w: 30, d: 18, h: 4.6, terraces: 6, seedShift: 1.3 });
  add(hillN, -18, -32, 0.1, -0.2);
  const xuexiang = pavilion({ shape: 'hex', size: 4.4, height: 3.0, roofH: 1.7 });
  add(xuexiang, ...LAYOUT.xuexiang.pav, 0, 4.2);
  const plums = [[-25, -28], [-14, -34], [-22, -36], [-8, -30]];
  for (const [x, z] of plums) add(tree({ trunkH: 3.2, crown: 2.3, kind: 'plum' }), x, z, 0, 1.6);

  /* ---------------- 复廊：中园与西园之间的一墙两廊 */
  const relay = corridorRun(LAYOUT.relay, { width: 3.4, height: 2.9, walls: 'both' });
  group.add(relay);

  /* ---------------- 西园（补园） */
  const fan = fanHall({ radius: 4.6, angle: Math.PI * 0.66, height: 3.1, roofH: 1.9 });
  add(fan, ...LAYOUT.yushui.fan, Math.PI);
  const yuanyang = hall({
    w: 17, d: 10, wallH: 5.0, baysX: 6, baysZ: 2, roofH: 3.0, terrace: 0.75,
    openFront: true, openBack: true, openSides: false, plaque: '卅六鸳鸯馆',
    latticeKind: 'blue',
  });
  add(yuanyang, ...LAYOUT.yuanyang.hall, 0);
  const yyFront = new THREE.Mesh(box(20, 0.3, 5.2), M.step);
  yyFront.position.set(-68, SITE.groundY + 0.6, -8.6);
  yyFront.receiveShadow = true;
  group.add(yyFront);

  const liuting = tower({ w: 8.5, d: 7, h1: 3.8, h2: 3.2, roofH: 2.0, plaque: '留听阁' });
  add(liuting, ...LAYOUT.liuting.pav, yawTo(0, -1));
  const daoying = tower({ w: 8, d: 6.5, h1: 4.0, h2: 3.2, plaque: '倒影楼' });
  add(daoying, ...LAYOUT.daoying.lou, yawTo(1, 0));
  const yiliang = pavilion({ shape: 'hex', size: 4.2, height: 3.0, roofH: 1.6 });
  add(yiliang, ...LAYOUT.yiliang.pav, 0);
  const taoying = pavilion({ shape: 'square', size: 4.0, height: 2.9, roofH: 1.5 });
  add(taoying, ...LAYOUT.taoying.pav, 0.3);
  const fucui = tower({ w: 7, d: 7, h1: 3.6, h2: 3.0, plaque: '浮翠阁' });
  add(fucui, ...LAYOUT.fucui.pav, 0, 3.0);
  const hillW = hill({ w: 22, d: 16, h: 3.4, terraces: 5, seedShift: 2.7 });
  add(hillW, -98, 14, -0.2, -0.1);
  const bobing = corridorRun([[-70, -13.5], [-79, -10], [-86, -4], [-88, 4]], { width: 2.6, height: 2.7 });
  group.add(bobing);

  /* ---------------- 园墙与外部 */
  const { wall } = SITE;
  const outer = [
    [[wall.x0, wall.z1], [wall.x0 + 30, wall.z1 + 4], [wall.x1 - 20, wall.z1 + 3], [wall.x1, wall.z0 + 20]],
    [[wall.x1, wall.z0 + 20], [wall.x1 + 2, wall.z0]],
    [[wall.x1 + 2, wall.z0], [wall.x0 + 26, wall.z0 - 3]],
    [[wall.x0 + 26, wall.z0 - 3], [wall.x0, wall.z0 + 12]],
    [[wall.x0, wall.z0 + 12], [wall.x0, wall.z1 + 4]],
  ];
  for (const run of outer) group.add(wallRun(run, { height: 3.8 }));

  // 大树沿路与墙脚：夜里读得出层次
  const groves = [
    [76, 46, 'broad'], [56, 50, 'broad'], [44, 50, 'pine'], [36, 48, 'broad'],
    [26, 44, 'broad'], [6, 40, 'pine'], [-4, 38, 'broad'], [-16, 34, 'broad'],
    [-30, 30, 'pine'], [-48, 32, 'broad'], [-58, 36, 'broad'], [-84, 30, 'pine'],
    [-96, 30, 'broad'], [-100, 8, 'broad'], [-98, -14, 'pine'], [-78, -20, 'broad'],
    [-52, -18, 'broad'], [-34, -30, 'pine'], [-14, -38, 'broad'], [8, -34, 'broad'],
    [40, -6, 'broad'], [44, 4, 'pine'], [40, 14, 'broad'], [70, 8, 'broad'],
    [80, 20, 'pine'], [84, 44, 'broad'], [52, 14, 'broad'], [56, 4, 'broad'],
  ];
  for (const [x, z, kind] of groves) {
    const t = tree({ trunkH: rr(3.4, 5.6), crown: rr(2.4, 3.6), kind });
    add(t, x, z, rand() * 3, SITE.groundY - 0.1);
  }
  const bambooC = bambooClump({ count: 14, height: 5.0, radius: 2.2 });
  add(bambooC, 34, 4, 0);
  const bambooD = bambooClump({ count: 18, height: 5.4, radius: 2.8 });
  add(bambooD, -44, -6, 0);

  scene.add(group);
  return { group, anchors };
}

/** 夜游里会客厅、鸳鸯馆这些"戏台"的可用投影面（y 为幕布中心高度，yaw 让它朝观众） */
export function projectionSurfaces() {
  return [
    { id: 'lizhai-screen', kind: 'ink', x: 80, y: 2.5, z: 41.9, w: 7.6, h: 3.4, yaw: 0 },
    { id: 'tingyu-wall', kind: 'plantain', x: 32.6, y: 2.6, z: 44, w: 7.4, h: 3.2, yaw: Math.PI / 2 },
    { id: 'yuanxiang-wall', kind: 'moon', x: 16, y: 3.0, z: 36.2, w: 12.0, h: 3.6, yaw: Math.PI },
    { id: 'yuanyang-wall', kind: 'finale', x: -68, y: 3.2, z: -8.2, w: 14.0, h: 3.8, yaw: 0 },
    { id: 'corridor-wall', kind: 'corridor', x: 48, y: 2.2, z: 48.4, w: 16.0, h: 2.6, yaw: 0.12 },
  ];
}
