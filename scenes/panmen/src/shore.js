import * as THREE from 'three';
import { M, glow, box, mesh, rr, rand, tileUV, lit } from './kit.js';
import { SITE, RIVER, LEVEL } from './data.js';
import * as T from './textures.js';

const HALF = RIVER.halfWidth;
const Q = LEVEL.quay;
const Z0 = -RIVER.length / 2, Z1 = RIVER.length / 2;

/** 堤面比城墙亮一档：夜里若地面不接光，整座城就像浮在黑洞上 */
const groundMat = lit('#cfc8b8', { map: T.paving('#7e776b'), rough: 0.96, emissive: '#100e0a', ei: 0.5 });

/** 堤面：运河两侧的地面，条石压顶，往里是夯土与街面 */
function ground(acc) {
  for (const s of [-1, 1]) {
    const w = 190;
    const g = new THREE.PlaneGeometry(w, RIVER.length + 20, 1, 1);
    g.rotateX(-Math.PI / 2);
    tileUV(g, w, RIVER.length + 20, 2.6);
    g.translate(s * (HALF + w / 2), Q, 0);
    acc.pave.push(g);
  }
  // 堤身：从压顶石往下直到河床，把水面封在两壁之间
  for (const s of [-1, 1]) {
    acc.wall.push(box(3.2, Q + 4.2, RIVER.length + 20, s * (HALF + 1.4), (Q + 4.2) / 2 - 4.2, 0));
  }
}

/** 石砌驳岸：分段压顶、每隔几米一支系缆石，岸边才有节奏 */
function quayWalls(acc) {
  const cap = [], body = [], bit = [];
  for (const s of [-1, 1]) {
    for (let z = Z0; z < Z1; z += 7.5) {
      const len = Math.min(7.5, Z1 - z);
      const bump = rr(-0.05, 0.05);
      body.push(box(1.1, Q + 3.4, len, s * (HALF - 0.35), (Q + 3.4) / 2 - 3.4 + bump, z + len / 2));
      cap.push(box(1.5, 0.3, len - 0.18, s * (HALF - 0.2), Q + 0.05, z + len / 2));
      if (rand() > 0.45) bit.push(box(0.34, 0.5, 0.34, s * (HALF - 0.9), Q + 0.4, z + len * 0.5));
    }
  }
  acc.wall.push(...body);
  acc.stone.push(...cap, ...bit);
}

/** 河埠头：石阶下到了水面，旁边一方洗衣石埠 */
function steps(acc, lights) {
  const parts = [];
  const spots = [
    [-1, -58, 5.0], [-1, 34, 4.4], [1, -22, 4.6], [1, 96, 5.2], [-1, 122, 4.4],
  ];
  for (const [s, z, w] of spots) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      parts.push(box(w, 0.26, 1.05, s * (HALF - 0.5 - t * 3.1), Q - t * (Q + 0.4), z + i * 0.2));
    }
    // 埠口两根石桩与一盏灯
    for (const k of [-1, 1]) {
      parts.push(box(0.42, 1.1, 0.42, s * (HALF - 0.6), Q + 0.45, z + k * (w / 2 + 0.4)));
    }
    lights.push({ p: [s * (HALF - 0.6), Q + 1.7, z], color: '#ffb066', halo: 1.9, column: 5 });
  }
  acc.stone.push(...parts);
}

/** 码头：城内一侧的一排木桩、跳板与石级，货船靠在这里 */
function dock(acc, lights) {
  const { dockX, dockZ } = SITE.quay;
  const piles = [], plank = [];
  for (let i = 0; i < 9; i++) {
    const z = dockZ + i * 3.4;
    for (const s of [-1, 1]) {
      const x = dockX + s * 1.6;
      const h = 4.6 + rr(-0.4, 0.5);
      const p = new THREE.CylinderGeometry(0.22, 0.26, h, 8);
      p.translate(x, h / 2 - 2.2, z);
      piles.push(p);
      const capG = new THREE.CylinderGeometry(0.3, 0.3, 0.16, 8);
      capG.translate(x, 2.3, z);
      plank.push(capG);
    }
  }
  // 栈桥：从堤面探出去四米
  plank.push(box(5.2, 0.28, 9.6, dockX - 1.2, Q - 0.1, dockZ + 14));
  for (let i = 0; i < 5; i++) {
    plank.push(box(5.2, 0.14, 0.3, dockX - 1.2, Q + 0.14, dockZ + 10 + i * 2.1));
  }
  acc.wood.push(...piles, ...plank);
  lights.push({ p: [dockX - 1.2, Q + 2.4, dockZ + 14], color: '#ffcf92', halo: 2.2, column: 6 });
  lights.push({ p: [dockX + 2.2, Q + 2.0, dockZ + 2], color: '#ffb066', halo: 1.8, column: 4 });
}

/** 石灯幢：堤上按间距立一座，夜里是运河唯一的规则光源 */
function lanternPosts(lights) {
  const grp = new THREE.Group();
  const parts = [], caps = [];
  for (let z = Z0 + 12; z <= Z1 - 12; z += 23) {
    for (const s of [-1, 1]) {
      const x = s * (HALF - 1.6);
      if (Math.abs(z - RIVER.zGate) < 12 && Math.abs(x) < 30) continue;
      parts.push(box(0.5, 3.0, 0.5, x, Q + 1.5, z));
      parts.push(box(0.8, 0.22, 0.8, x, Q + 3.1, z));
      caps.push(box(0.46, 0.56, 0.46, x, Q + 3.46, z));
      lights.push({ p: [x, Q + 3.46, z], color: '#ffd79a', halo: 1.0, column: 6 });
    }
  }
  grp.add(mesh(parts, M.stoneDressed));
  for (const c of caps) {
    const lamp = new THREE.Mesh(c, glow('#ffdda8', 0.92));
    grp.add(lamp);
  }
  return grp;
}

export function buildShore(scene) {
  const group = new THREE.Group();
  group.name = 'panmen-shore';
  const acc = { pave: [], wall: [], stone: [], wood: [] };
  const lights = [];

  ground(acc);
  quayWalls(acc);
  steps(acc, lights);
  dock(acc, lights);

  group.add(mesh(acc.pave, groundMat));
  group.add(mesh(acc.wall, M.brick));
  group.add(mesh(acc.stone, M.stoneDressed));
  group.add(mesh(acc.wood, M.beam));
  group.add(lanternPosts(lights));

  addLamps(group, lights);
  scene.add(group);
  return { group, lights: group.userData.lamps };
}

function addLamps(group, spots) {
  const lamps = [];
  for (const s of spots) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(s.color || '#ffcf92', 1.15));
    head.position.set(...s.p);
    group.add(head);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,204,138', 0.14), transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.scale.setScalar((s.halo || 1.6) * 0.45);
    sp.position.set(...s.p);
    group.add(sp);
    if (s.column) lamps.push({ p: new THREE.Vector3(...s.p), color: s.color, width: s.column * 0.42, depth: s.column });
  }
  group.userData.lamps = lamps;
  return lamps;
}
