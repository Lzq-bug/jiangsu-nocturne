/**
 * 寄畅园：锦汇漪居中偏东、南北狭长，东折一段水面直抵低墙，
 * 好把锡山龙光塔借进画面。西岸叠石接惠山余脉，八音涧引二泉伏流东下。
 */
import * as THREE from 'three';
import { M, glow, lit, box, mesh, rand, rr, chineseRoof, plaqueMesh, registerOccluder } from './kit.js';
import * as T from './textures.js';
import {
  wallRun, rockRing, peakRock, pavilion, hall, corridor,
  bambooClump, lotusLeaves, moonInPool, lanternCluster, groundPad, treeRow,
} from './build.js';
import { GARDEN } from './data.js';

const GY = GARDEN.groundY;
const P = GARDEN.pond;
const ARM = GARDEN.pondArm;

/** 知鱼槛：半边架在水上的敞槛，柱子插进池底，面向池心 */
function verandah({ x, z, w, d, h, rot = 0 }) {
  const grp = new THREE.Group();
  const deck = [box(w, 0.3, d, 0, GY - 0.5, 0)];
  const posts = [], rails = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      posts.push(new THREE.CylinderGeometry(0.13, 0.15, h, 9).translate(sx * (w / 2 - 0.35), GY - 0.65 + h / 2, sz * (d / 2 - 0.35)));
    }
  }
  // 池里的支柱
  for (let i = 0; i < 3; i++) {
    const px = -w / 2 + 0.6 + (i * (w - 1.2)) / 2;
    posts.push(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 7).translate(px, P.y - 1.6 + 1.6, d / 2 - 0.4));
  }
  for (const [L, px, pz] of [[w, 0, d / 2 - 0.18], [w, 0, -d / 2 + 0.18], [d, -w / 2 + 0.18, 0], [d, w / 2 - 0.18, 0]]) {
    rails.push(box(L, 0.14, 0.34, px, GY - 0.35 + 0.5, pz));
    rails.push(box(L, 0.42, 0.1, px, GY - 0.35 + 0.85, pz));
  }
  grp.add(mesh(deck, M.beam));
  grp.add(mesh(posts, M.pillar));
  grp.add(mesh(rails, M.beam));
  const rf = mesh([chineseRoof({ width: w + 1.5, depth: d + 1.5, height: 1.3, ridgeRatio: 0.55, overhang: 0.45 })], M.roof);
  rf.position.set(0, GY - 0.5 + h, 0);
  rf.rotation.y = Math.PI / 2;
  grp.add(rf);
  grp.position.set(x, 0, z);
  grp.rotation.y = rot;
  return grp;
}

/** 凌虚阁：高台上一层阁，可俯看全池 */
function upperChamber({ x, z, w, d, h, platform }) {
  const grp = new THREE.Group();
  const base = [box(w + 2.6, platform, d + 2.6, 0, platform / 2, 0)];
  for (let k = 0; k < 5; k++) base.push(box(0.95, 0.24, w * 0.46, 0, 0.12 + k * 0.24, d / 2 + 1.7 + k * 0.92));
  const walls = [
    box(0.45, h, d, -w / 2, platform + h / 2, 0),
    box(w, h, 0.45, 0, platform + h / 2, -d / 2),
    box(w, h, 0.45, 0, platform + h / 2, d / 2),
  ];
  const timber = [], fans = [];
  for (let i = 0; i <= 4; i++) {
    const pz = -d / 2 + (d * i) / 4;
    timber.push(new THREE.CylinderGeometry(0.2, 0.23, h, 10).translate(w / 2 - 0.4, platform + h / 2, pz));
    fans.push(box(0.13, h * 0.7, d / 4 - 0.5, w / 2 - 0.55, platform + h * 0.4, pz + d / 8));
  }
  const rf = mesh([chineseRoof({ width: h * 1.14, depth: d + 2.8, height: h * 0.34, ridgeRatio: 0.4, overhang: 0.6 })], M.roof);
  rf.position.set(0, platform + h + 0.2, 0);
  rf.rotation.y = Math.PI / 2;
  grp.add(mesh(base, M.stoneDressed));
  grp.add(mesh(walls, M.wall));
  grp.add(mesh(timber, M.pillarBright));
  grp.add(mesh(fans, lit('#4a2b1c', { map: T.wood('#5c3524', '#351a11'), rough: 0.75 })));
  grp.add(rf);
  grp.add(mesh([box(0.08, h * 0.48, d * 0.5, w / 2 - 0.46, platform + h * 0.38, 0)], glow('#ffbe72', 1.0)));
  grp.position.set(x, GY, z);
  return grp;
}

/** 七星桥：七折板桥跨池，转折处微微抬 */
function sevenStarBridge({ cx, cz, steps = 7, rot = 0 }) {
  const grp = new THREE.Group();
  const span = 30, seg = span / steps;
  const deck = [], posts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const px = -span / 2 + span * t;
    const py = P.y + 0.62 + 0.34 * Math.sin(Math.PI * t);
    const yaw = (i % 2 ? 1 : -1) * 0.16;
    const g = box(seg + 0.3, 0.26, 2.4, 0, py, 0);
    g.rotateY(yaw);
    g.translate(px, 0, (i % 2 ? 0.32 : -0.32));
    deck.push(g);
    if (i % 2 === 0) posts.push(box(0.24, 1.1, 0.24, px, P.y + 0.2, (i % 2 ? 0.32 : -0.32) + 1.1));
  }
  grp.add(mesh(deck, M.stoneDressed));
  grp.add(mesh(posts, M.stone));
  grp.position.set(cx, 0, cz);
  grp.rotation.y = rot;
  return grp;
}

/** 八音涧：两壁湖石夹一线水，自西高东低落进池里 */
function eightToneRavine(scene) {
  const { x0, x1, z, width, fall } = GARDEN.ravine;
  const grp = new THREE.Group();
  const rocks = [];
  for (let i = 0; i < 42; i++) {
    const t = rand();
    const px = x0 + (x1 - x0) * t;
    const side = i % 2 ? 1 : -1;
    const py = GY + fall * (1 - t) - 0.8 + rand() * 1.6;
    const s = rr(0.7, 1.7);
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1.05, rr(0.6, 1.15), 0.85);
    g.rotateY(rand() * 6.28);
    g.translate(px, py, z + side * (width / 2 + rand() * 0.6));
    rocks.push(g);
  }
  grp.add(mesh(rocks, lit('#c2c9d4', { map: T.lakeStone('#a5adba'), rough: 0.9, emissive: '#121a28', ei: 0.45 })));
  const sheet = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    sheet.push(box((x1 - x0) / 14 + 0.1, 0.14, width, x0 + (x1 - x0) * t, GY + fall * (1 - t) - 0.65, z));
  }
  const water = mesh(sheet, new THREE.MeshBasicMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.32 }));
  water.material.toneMapped = false;
  grp.add(water);
  // 涧里一线灯，才看得见"石壁藏水"
  const lit0 = [];
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    lit0.push(box(0.22, 0.22, 0.22, x0 + (x1 - x0) * t, GY + fall * (1 - t) - 0.3, z + (k % 2 ? width / 2 : -width / 2)));
  }
  grp.add(mesh(lit0, glow('#8fd2ff', 1.4)));
  scene.add(grp);
  return { group: grp, water };
}

/** 康熙"山色溪光"、乾隆"玉戛金枞"两块石匾 */
function stonePlaques(root) {
  const mk = (text, x, z, ry) => {
    const p = plaqueMesh(text, 3.1, 1.0, { dir: 'h', bg: '#5d6572', fg: '#1d232e', border: '#8b93a1' });
    p.position.set(x, GY + 2.4, z);
    p.rotation.y = ry;
    root.add(p);
  };
  const G = GARDEN.plaques;
  mk(G.kangxi, GARDEN.jiashu.x - 1.2, GARDEN.jiashu.z + GARDEN.jiashu.d / 2 + 0.6, Math.PI / 2);
  mk(G.qianlong, GARDEN.hanzhen.x + 1.2, GARDEN.hanzhen.z - GARDEN.hanzhen.d / 2 - 0.6, -Math.PI / 2);
}

export function buildGarden(scene, columns, reflections) {
  const root = new THREE.Group();
  root.name = 'garden';
  scene.add(root);

  // 园地坪：把主池与东折的水面挖掉
  // 地坪不进倒影组：镜面会把 4.2 的地面翻到水面上面去，变成一层灰皮
  scene.add(groundPad({
    x0: GARDEN.x0, x1: GARDEN.x1, z0: GARDEN.z0, z1: GARDEN.z1, y: GY, mat: M.stone,
  }));

  // 池岸
  root.add(rockRing({ cx: P.cx, cz: P.cz, hw: P.hw, hd: P.hd, y: P.y, count: 92, scale: 0.8 }));
  root.add(rockRing({ cx: ARM.cx, cz: ARM.cz, hw: ARM.hw, hd: ARM.hd, y: ARM.y, count: 62, scale: 0.8 }));

  // 四墙。园门在北墙（通惠山寺巷），东墙临水一段压到 1.35 米，借景从这一线出去
  root.add(wallRun({
    from: [GARDEN.x0, GARDEN.z0], to: [GARDEN.x0, GARDEN.z1], groundY: GY, gaps: gateGaps(),
  }).group);
  root.add(wallRun({ from: [GARDEN.x1, GARDEN.z0], to: [GARDEN.x1, GARDEN.z1], groundY: GY, windows: [{ t: 0.42 }] }).group);
  root.add(wallRun({ from: [GARDEN.x0, GARDEN.z0], to: [GARDEN.x1, GARDEN.z0], groundY: GY }).group);
  // 东墙（+Z 一侧）：北半段、低段、南半段
  root.add(wallRun({ from: [GARDEN.x0, GARDEN.z1], to: [GARDEN.openEast.x0, GARDEN.z1], groundY: GY }).group);
  root.add(wallRun({ from: [GARDEN.openEast.x1, GARDEN.z1], to: [GARDEN.x1, GARDEN.z1], groundY: GY }).group);
  root.add(wallRun({
    from: [GARDEN.openEast.x0, GARDEN.openEast.z], to: [GARDEN.openEast.x1, GARDEN.openEast.z],
    groundY: GY, h: 1.35, thick: 0.3,
  }).group);

  // 园门：入门东望即见锡山龙光塔
  const gp = GARDEN.gate;
  const gate = new THREE.Group();
  gate.add(mesh([
    box(1.2, gp.h + 0.6, 1.5, 0, (gp.h + 0.6) / 2, -gp.w / 2 - 0.7),
    box(1.2, gp.h + 0.6, 1.5, 0, (gp.h + 0.6) / 2, gp.w / 2 + 0.7),
    box(1.3, 0.5, gp.w + 3.4, 0, gp.h + 0.5, 0),
  ], M.stoneDressed));
  gate.add(mesh([box(0.5, gp.h * 0.66, gp.w * 0.86, 0.55, gp.h * 0.42, 0)], glow('#ffbe72', 1.2)));
  const gateRoof = mesh([chineseRoof({ width: gp.w + 4.2, depth: 2.6, height: 0.95, ridgeRatio: 0.92, overhang: 0.35 })], M.roof);
  gateRoof.position.set(0, gp.h + 0.8, 0);
  gateRoof.rotation.y = Math.PI / 2;
  gate.add(gateRoof);
  gate.position.set(GARDEN.x0, GY, gp.z);
  root.add(gate);

  // 建筑
  const jst = hall({ bays: 3, bayW: 3.9, depth: GARDEN.jiashu.d, h: GARDEN.jiashu.h, groundY: GY, name: '嘉树堂' });
  jst.group.position.set(GARDEN.jiashu.x, GY, GARDEN.jiashu.z);
  jst.group.rotation.y = 0;              // 正面朝 +X（南），对着池心
  root.add(jst.group);

  const hz = hall({ bays: 3, bayW: 3.7, depth: GARDEN.hanzhen.d, h: GARDEN.hanzhen.h, groundY: GY, name: '含贞斋' });
  hz.group.position.set(GARDEN.hanzhen.x, GY, GARDEN.hanzhen.z);
  hz.group.rotation.y = Math.PI;         // 含贞斋在池南，面朝北
  root.add(hz.group);

  root.add(upperChamber({ ...GARDEN.lingxu }));
  root.add(verandah({ ...GARDEN.zhiyu, rot: -0.5 }));

  const hb = pavilion({ w: GARDEN.hanbi.w, d: GARDEN.hanbi.w, h: GARDEN.hanbi.h, groundY: P.y - 0.1, round: true, green: true });
  hb.position.set(GARDEN.hanbi.x, P.y - 0.1, GARDEN.hanbi.z);
  root.add(hb);

  const mt = pavilion({ w: GARDEN.meiting.w, d: GARDEN.meiting.w, h: GARDEN.meiting.h, groundY: GY, round: true });
  mt.position.set(GARDEN.meiting.x, GY, GARDEN.meiting.z);
  root.add(mt);

  const yp = pavilion({ w: GARDEN.yupan.w, d: GARDEN.yupan.w, h: GARDEN.yupan.h, groundY: GY + 0.6, green: true });
  yp.position.set(GARDEN.yupan.x, GY + 0.6, GARDEN.yupan.z);
  root.add(yp);

  root.add(sevenStarBridge({ ...GARDEN.sevenStar }));

  // 北岸沿池步道 + 一段游廊
  const path = [];
  const zA = P.cz + 16, zB = ARM.cz + ARM.hd - 2;
  for (let k = 0; k < 26; k++) {
    const t = k / 25;
    path.push(box(2.3, 0.14, (zB - zA) / 26 + 0.05, GARDEN.x0 + 7.4, GY + 0.07, zA + (zB - zA) * t));
  }
  root.add(mesh(path, M.stoneDressed));
  root.add(corridor({
    from: [GARDEN.lingxu.x + 6.4, GARDEN.lingxu.z], to: [GARDEN.hanbi.x + 2, GARDEN.jiashu.z + 8],
    groundY: GY, h: 2.8, posts: 9, roofW: 2.3,
  }));

  // 西岸叠石接惠山余脉
  for (const [x, z, h] of GARDEN.rocks) root.add(peakRock({ x, z, y: GY + h * 0.2, h, lean: rr(-0.14, 0.14) }));
  eightToneRavine(scene);
  stonePlaques(root);

  // 植物
  for (const b of [[GARDEN.x0 + 5, GARDEN.z0 + 9], [GARDEN.openEast.x1 + 8, GARDEN.z1 - 8], [GARDEN.x1 - 6, GARDEN.z0 + 16]]) {
    bambooClump(scene, b, GY, 11);
  }
  treeRow(scene, [
    [GARDEN.x1 - 12, GARDEN.z0 + 26, 0.8, GY],
    [GARDEN.x0 + 6, GARDEN.z1 - 14, 0.78, GY],
    [GARDEN.hanzhen.x + 6, GARDEN.hanzhen.z + 4, 0.9, GY],
  ]);

  // 灯火：北岸廊下与建筑檐前
  const spots = [];
  for (let k = 0; k < 8; k++) {
    const t = k / 7;
    spots.push([GARDEN.x0 + 8.8, GY + 2.6, P.cz - 26 + (52) * t]);
  }
  spots.push([GARDEN.jiashu.x + 3.4, GY + 4.4, GARDEN.jiashu.z + 4.4]);
  spots.push([GARDEN.hanzhen.x - 3.4, GY + 4.2, GARDEN.hanzhen.z - 3.6]);
  spots.push([GARDEN.zhiyu.x - 2.4, GY + 2.6, GARDEN.zhiyu.z + 3.0]);
  spots.push([GARDEN.lingxu.x + 3.0, GY + GARDEN.lingxu.platform + 3.2, GARDEN.lingxu.z + 3.4]);
  const lanterns = lanternCluster(scene, spots, { scale: 0.92, halo: 3.6 });
  for (const [x, y, z] of spots) registerOccluder(lanterns, 1.8, new THREE.Vector3(x, y, z));

  // 水里的光与月
  columns.add(new THREE.Vector3(GARDEN.zhiyu.x - 2.4, 0, GARDEN.zhiyu.z + 3), '#ffcf94', 1.6, 5.4, 0.6, P.y);
  columns.add(new THREE.Vector3(GARDEN.jiashu.x + 3.4, 0, GARDEN.jiashu.z + 4.4), '#ffb46b', 1.4, 4.8, 0.5, P.y);
  columns.add(new THREE.Vector3(GARDEN.openEast.x0 + 6, 0, GARDEN.openEast.z - 3), '#8fd2ff', 1.1, 4.2, 0.34, ARM.y);
  const moon = moonInPool(scene, { x: ARM.cx + 1.4, z: ARM.cz + 4, y: ARM.y + 0.03, size: 1.0 });
  lotusLeaves(scene, { cx: P.cx - 8, cz: P.cz + 2, hw: 8, hd: 6, y: P.y + 0.04 }, 58);
  lotusLeaves(scene, { cx: ARM.cx - 3, cz: ARM.cz - 6, hw: 4.5, hd: 5, y: ARM.y + 0.04 }, 24);

  reflections.add(root);

  return {
    root,
    lanterns,
    moon,
    update(t, lantern) {
      lanterns.visible = lantern > 0.02;
      moon.disc.scale.setScalar(0.86 + 0.12 * Math.sin(t * 0.7));
    },
  };
}

/** 东墙上的门洞缺口（按墙长归一化） */
function gateGaps() {
  const gp = GARDEN.gate;
  const wall = GARDEN.z1 - GARDEN.z0;
  const t = (gp.z - GARDEN.z0) / wall;
  return [[Math.max(0.02, t - 1.8 / wall), Math.min(0.98, t + 1.8 / wall)]];
}

export { verandah, upperChamber, sevenStarBridge, eightToneRavine };
