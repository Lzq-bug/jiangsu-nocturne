/**
 * 正桥：9 墩 10 孔的双层钢桁梁、上下两层桥面、栏板与 202 块浮雕。
 * 坐标按 data.js 的桥轴（+z 为南岸），高程一律走 GIRDER 与 roadY/railY。
 */
import * as THREE from 'three';
import {
  PIERS, PIER, GIRDER, MAIN_END, ABUT, SPANS, RELIEF,
} from './data.js';
import { M, box, member, mesh, loft, remat } from './kit.js';

const { bottomY, trussH, trussX, deckW, railDeckW, trackX, panel } = GIRDER;
const topY = bottomY + trussH;
const ROAD = GIRDER.roadY;
const RAILD = GIRDER.railY;
const L = MAIN_END * 2;

/** 桁架节点：沿桥轴每 panel 米一个，正桥范围内连续（节间长为写意） */
function panelPoints() {
  const zs = [];
  const n = Math.round(L / panel);
  for (let i = 0; i <= n; i++) zs.push(-MAIN_END + i * panel);
  return zs;
}

/** 支撑点 z：南桥台 — 9 墩 — 北桥台 */
export const SUPPORTS = [ABUT, ...PIERS, -ABUT];

/* ------------------------------------------------------------------ 钢桁梁 */

function trussGeometry() {
  const parts = [];
  const zs = panelPoints();
  for (const sx of [-trussX, trussX]) {
    // 上下弦通长，静帧里读出一条直线
    parts.push(box(0.95, 1.15, L, sx, bottomY - 0.55, 0));
    parts.push(box(0.95, 1.05, L, sx, topY - 0.5, 0));
    // 人字斜杆 + 竖杆
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1], mid = (z0 + z1) / 2;
      parts.push(member([sx, bottomY, z0], [sx, topY, z0], 0.72, 0.8));
      parts.push(member([sx, bottomY, z0], [sx, topY, mid], 0.6, 0.72));
      parts.push(member([sx, topY, mid], [sx, bottomY, z1], 0.6, 0.72));
    }
    const ze = zs[zs.length - 1];
    parts.push(member([sx, bottomY, ze], [sx, topY, ze], 0.72, 0.8));
  }
  // 上下平纵联：每隔两节间一道横联
  for (let i = 0; i < zs.length; i += 2) {
    const z = zs[i];
    parts.push(box(trussX * 2, 0.5, 0.5, 0, topY - 0.3, z));
    parts.push(box(trussX * 2, 0.45, 0.45, 0, bottomY + 0.4, z));
  }
  // 横桁：每个支撑点一道，托住上层桥面
  for (const z of SUPPORTS) {
    parts.push(box(trussX * 2, 0.8, 0.8, 0, topY - 0.4, z));
    parts.push(box(trussX * 2, 0.7, 0.7, 0, bottomY - 0.35, z));
  }
  return parts;
}

/* ------------------------------------------------------------------ 两层桥面 */

function upperDeck() {
  return [
    box(deckW, 0.42, L, 0, ROAD - 0.42, 0),
    // 人行道比车行道高出一阶（2.25 米净宽）
    box(GIRDER.walkW, 0.16, L, -(deckW / 2 - GIRDER.walkW / 2), ROAD - 0.02, 0),
    box(GIRDER.walkW, 0.16, L, deckW / 2 - GIRDER.walkW / 2, ROAD - 0.02, 0),
  ];
}

function lowerDeck() {
  const parts = [
    // 下层道床板：双线铁路桥宽 14 米
    box(railDeckW, 0.5, L, 0, RAILD - 0.5, 0),
  ];
  for (const sx of [-trackX, trackX]) {
    parts.push(box(0.16, 0.28, L, sx - 0.75, RAILD + 0.02, 0));
    parts.push(box(0.16, 0.28, L, sx + 0.75, RAILD + 0.02, 0));
  }
  // 检修道：下层是否设可行人的检修道查无记载，画在一侧属写意
  parts.push(box(1.3, 0.16, L, railDeckW / 2 + 0.95, RAILD - 0.06, 0));
  return parts;
}

/* ------------------------------------------------------------------ 栏板与浮雕 */

/**
 * 202 块浮雕：南北两侧沿正桥各 98 块，另 6 块"工农兵"放在桥头。
 * 块数可考，排列与间距无记载，取均匀排布（写意）。
 */
function railings() {
  const posts = [];
  const sun = [];
  const scene = [];
  const worker = [];
  const base = ROAD + 0.14;
  const perSide = RELIEF.sunflower;
  const step = L / perSide;
  for (const sx of [-deckW / 2, deckW / 2]) {
    // 下槛 + 扶手 + 每块栏板两端一根立柱：中间是空的，浮雕才看得见
    posts.push(box(0.26, 0.26, L, sx, base, 0));
    posts.push(box(0.2, 0.16, L, sx, base + RELIEF.panelH + 0.1, 0));
    for (let i = 0; i <= perSide; i++) {
      posts.push(box(0.28, RELIEF.panelH + 0.36, 0.28, sx, base, -MAIN_END + i * step));
    }
  }
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? -deckW / 2 : deckW / 2;
    for (let i = 0; i < perSide; i++) {
      const z = -MAIN_END + (i + 0.5) * step;
      const g = new THREE.BoxGeometry(0.2, RELIEF.panelH, RELIEF.panelW);
      g.translate(sx, base + RELIEF.panelH / 2 + 0.2, z);
      (i % 2 === 0 ? sun : scene).push(g);
    }
    for (let i = 0; i < 3; i++) {
      const z = (side === 0 ? -1 : 1) * (MAIN_END - 6 - i * 3.2);
      const g = new THREE.BoxGeometry(0.22, RELIEF.panelH, RELIEF.panelW);
      g.translate(sx, base + RELIEF.panelH / 2 + 0.2, z);
      worker.push(g);
    }
  }
  return { posts, sun, scene, worker };
}

/* ------------------------------------------------------------------ 桥墩 */

function roundedRect() {
  const r = 0.34, c = 1 - r, pts = [];
  const arc = (sx, sz, a0, a1) => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + ((a1 - a0) * i) / 3;
      pts.push([sx * c + r * Math.cos(a), sz * c + r * Math.sin(a)]);
    }
  };
  pts.push([-c, -1]);
  arc(1, -1, -Math.PI / 2, 0);
  arc(1, 1, 0, Math.PI / 2);
  arc(-1, 1, Math.PI / 2, Math.PI);
  arc(-1, -1, Math.PI, Math.PI * 1.5);
  pts.pop();
  return pts;
}

function pierGeometry() {
  const parts = [];
  for (const z of PIERS) {
    const base = -3.4;
    const top = bottomY - 0.3;
    const steps = 6;
    const lv = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      lv.push({
        y: base + (top - base) * t, cx: 0, cz: z,
        sx: (PIER.cross / 2) * (1 - 0.32 * t),
        sz: (PIER.along / 2) * (1 - 0.26 * t),
      });
    }
    parts.push(loft(lv, roundedRect(), { uvScale: 4.2 }));
    parts.push(box(PIER.cross + 1.6, PIER.capH, PIER.along + 1.4, 0, top - 0.1, z));
    // 水线附近的潮湿带
    parts.push(box(PIER.cross * 0.96, 2.0, PIER.along * 0.96, 0, -1.0, z));
  }
  return parts;
}

/* ------------------------------------------------------------------ 桥台 */

function abutmentGeometry() {
  const parts = [];
  for (const z of [ABUT, -ABUT]) {
    const sgn = Math.sign(z);
    parts.push(box(PIER.cross + 2.2, topY - 0.4, 6.0, 0, -1.6, z));
    parts.push(box(deckW + 1.4, 3.4, 4.0, 0, bottomY - 1.4, z + sgn * 3.6));
  }
  return parts;
}

/* ------------------------------------------------------------------ 装配 */

export function buildMainBridge(scene) {
  const grp = new THREE.Group();
  grp.name = 'main-bridge';

  grp.add(mesh(pierGeometry(), M.pier));
  grp.add(mesh(abutmentGeometry(), M.concreteDark));
  grp.add(mesh(lowerDeck(), remat(M.ballast, 1, 58)));
  grp.add(mesh(trussGeometry(), M.steel));

  const road = mesh(upperDeck(), remat(M.asphalt, 1, 1050));
  road.name = 'road-deck';
  grp.add(road);
  grp.add(mesh([box(0.2, 0.5, L, -(deckW / 2 - 0.1), ROAD - 0.7, 0),
    box(0.2, 0.5, L, deckW / 2 - 0.1, ROAD - 0.7, 0)], M.curb));

  const rail = railings();
  grp.add(mesh(rail.posts, M.railing));
  grp.add(mesh(rail.sun, M.reliefSun));
  grp.add(mesh(rail.scene, M.reliefScene));
  grp.add(mesh(rail.worker, M.reliefWorker));

  /* 层间的一圈边缘光：不是考据里的灯具，只为让双层在夜里读得出来（写意） */
  const edge = new THREE.Group();
  edge.name = 'bridge-outline';
  for (const sx of [-trussX, trussX]) {
    edge.add(mesh(box(0.26, 0.18, L, sx, topY + 0.06, 0), M.outline));
    edge.add(mesh(box(0.22, 0.14, L, sx, bottomY + 0.06, 0), M.outlineCold));
  }
  for (const z of SUPPORTS) {
    edge.add(mesh(box(trussX * 2, 0.16, 0.16, 0, topY + 0.06, z), M.outline));
  }
  grp.add(edge);

  scene.add(grp);

  return {
    group: grp,
    edge,
    topY,
    bottomY,
    roadTop: ROAD,
    railTop: RAILD,
    spans: SPANS,
    setOutline(on) { edge.visible = on; },
  };
}
