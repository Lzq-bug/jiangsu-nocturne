import * as THREE from 'three';
import {
  M, PAL, glow, rand, rr, chineseRoof, ridgeOrnament, pillarGeo,
  bracketGeo, plaqueMesh, gableWallGeo, boxGeo, mesh, registerOccluder,
} from './kit.js';
import { RIVER } from './data.js';
import * as T from './textures.js';

const DECK = RIVER.deckY;
const HW = RIVER.halfWidth;

// mergeGeometries 不接受 indexed 与 non-indexed 混装，先统一成非索引
const ni = (g) => (g.index ? g.toNonIndexed() : g);

/* 灯笼共用一份几何与几种材质：一只灯从六个对象降到四个，全街就少几百次绘制 */
let LANTERN_GEO = null;
const lanternMats = new Map();
function lanternGeo() {
  if (!LANTERN_GEO) LANTERN_GEO = new THREE.SphereGeometry(0.26, 10, 8);
  return LANTERN_GEO;
}
function lanternMat(color) {
  if (!lanternMats.has(color)) {
    lanternMats.set(color, new THREE.MeshStandardMaterial({
      map: T.lanternPaper(), color: 0xffe4bb, roughness: 0.6,
      emissive: new THREE.Color(color), emissiveIntensity: 1.5,
    }));
  }
  return lanternMats.get(color);
}

/* ------------------------------------------------------------------ 灯火小件 */

/** 一只檐下灯笼：纸壳 + 内芯 + 光晕 */
export function lanternProp(x, y, z, { color = PAL.lanternWarm, r = 0.26 } = {}) {
  const grp = new THREE.Group();
  const shell = new THREE.Mesh(lanternGeo(), lanternMat(color));
  const k = r / 0.26;
  shell.scale.set(k, 1.22 * k, k);
  const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 6), glow('#fff0c8', 1.6));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.6, r * 0.3, 8), M.beam);
  cap.position.y = r * 1.25;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,196,120', 0.1), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.scale.set(0.9, 0.9, 1);
  halo.material.toneMapped = false;
  grp.add(shell, core, cap, halo);
  grp.position.set(x, y, z);
  return grp;
}

/** 石灯柱：河埠、堤顶、街口用。返回 {group, flame} */
export function stoneLamp({ height = 2.5, color = PAL.lampGlow } = {}) {
  const grp = new THREE.Group();
  const parts = [];
  parts.push(boxGeo(0.5, 0.3, 0.5, 0, 0.15, 0));
  const shaft = new THREE.CylinderGeometry(0.13, 0.17, height - 1.0, 8);
  shaft.translate(0, (height - 1.0) / 2 + 0.3, 0);
  parts.push(shaft);
  parts.push(boxGeo(0.42, 0.12, 0.42, 0, height - 0.62, 0));
  grp.add(mesh(parts, M.stone));
  grp.children[0].castShadow = true;
  const frame = new THREE.Mesh(boxGeo(0.46, 0.5, 0.46, 0, height - 0.31, 0), M.stoneDressed);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(color, 1.5));
  flame.position.y = height - 0.31;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,208,150', 0.1), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(1.7, 1.7, 1);
  halo.material.toneMapped = false;
  halo.position.y = height - 0.31;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.3, 4), M.stoneDark);
  roof.position.y = height - 0.06;
  roof.rotation.y = Math.PI / 4;
  grp.add(frame, flame, halo, roof);
  registerOccluder(grp, 2.6);
  return { group: grp, flame };
}

/** 拴船石 / 石凳一类的岸边小物 */
export function quayFurniture(x, z) {
  const parts = [];
  parts.push(boxGeo(0.34, 0.9, 0.34, 0, 0.45, 0));
  parts.push(boxGeo(0.62, 0.16, 0.62, 0, 0.94, 0));
  const bolt = new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6);
  bolt.rotateZ(Math.PI / 2);
  bolt.translate(0.2, 0.72, 0);
  parts.push(bolt);
  const m = mesh(parts, M.stoneDressed);
  m.position.set(x, 0, z);
  m.rotation.y = rand() * 3;
  m.castShadow = true;
  return m;
}

/* ------------------------------------------------------------------ 河房 */

/**
 * 一间铺面/宅院。face=+1 开门朝 +X（朝河），-1 朝 -X（朝街）。
 * 体量都是硬山低屋，只有屋脊起翘露在夜里。
 */
export function housePlot({
  w = 7, d = 6, storeys = 1, face = 1, sign = '', lanterns = 2,
  upperLight = 0.45, ground = DECK, brick = rand() > 0.45,
} = {}) {
  const grp = new THREE.Group();
  const wallH = storeys === 2 ? 5.6 : 3.4;
  const roofH = 1.4 + d * 0.12;

  const body = new THREE.Mesh(boxGeo(w, wallH, d, 0, wallH / 2, 0), brick ? M.brick : M.wall);
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);

  // 山墙、板门与挑梁都是深色木石，合成一份几何只走一次绘制
  const trim = [];
  for (const s of [-1, 1]) {
    const g = gableWallGeo({ width: d + 0.5, wallHeight: wallH, roofRise: roofH, thickness: 0.36 });
    g.rotateY(Math.PI / 2);
    g.translate(s * (w / 2 + 0.18), 0, 0);
    trim.push(ni(g));
  }

  const roof = new THREE.Mesh(
    chineseRoof({ width: w + 1.1, depth: d + 0.9, height: roofH, ridgeRatio: 0.3, curve: 0.55, eaveLift: 0.35, overhang: 0.35, hip: false }),
    rand() > 0.3 ? M.roof : M.roofDark,
  );
  roof.position.y = wallH;
  roof.castShadow = true;
  grp.add(roof);
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: w + 1.1, depth: d + 0.9, height: roofH, ridgeRatio: 0.3, overhang: 0.35 }),
    M.ridge,
  );
  ridge.position.y = wallH;
  grp.add(ridge);

  // 临街一面的檐柱、挑梁与披檐
  const eaveY = wallH - 0.35;
  const posts = [];
  for (const s of [-1, 1]) {
    const p = pillarGeo(wallH - 0.3, 0.13);
    p.translate(s * (w / 2 - 0.7), (wallH - 0.3) / 2, face * (d / 2 + 0.5));
    posts.push(p);
  }
  trim.push(ni(boxGeo(1.2, 2.15, 0.14, 0, 1.07, face * (d / 2 + 0.08))));      // 板门
  trim.push(ni(boxGeo(w, 0.24, 0.2, 0, eaveY, face * (d / 2 + 0.5))));         // 挑梁
  const trimMesh = mesh(trim, M.brickDark);
  trimMesh.castShadow = true;
  grp.add(trimMesh, mesh(posts, M.pillar));
  const lean = new THREE.Mesh(
    chineseRoof({ width: w + 0.6, depth: 1.5, height: 0.55, ridgeRatio: 0.9, curve: 0.8, eaveLift: 0.2, overhang: 0.2, hip: false }),
    M.roofDark,
  );
  lean.position.set(0, eaveY + 0.05, face * (d / 2 + 1.0));
  lean.rotation.x = face > 0 ? 0.22 : -0.22;
  grp.add(lean);

  // 格扇：关着的、亮着的窗棂、亮着的火光面，各并成一份
  const cols = storeys === 2 ? 3 : 2;
  const shut = [];
  const lit = [];
  const hot = [];
  for (let k = 0; k < cols; k++) {
    const x = -w / 2 + w * ((k + 0.5) / cols);
    for (let f = 0; f < storeys; f++) {
      const y = f === 0 ? 0.35 : wallH - 1.25;
      const h = f === 0 ? 1.5 : 1.15;
      const on = rand() < (f === 0 ? 0.6 : upperLight);
      const p = new THREE.PlaneGeometry(w / cols - 0.9, h);
      if (face < 0) p.rotateY(Math.PI);
      p.translate(x, y + h / 2, face * (d / 2 + 0.02));
      (on ? lit : shut).push(p);
      if (on) {
        const q = new THREE.PlaneGeometry((w / cols - 0.9) * 0.88, h * 0.84);
        if (face < 0) q.rotateY(Math.PI);
        q.translate(x, y + h / 2, face * (d / 2 + 0.05));
        hot.push(q);
      }
    }
  }
  if (shut.length) grp.add(mesh(shut, M.woodDark));
  if (lit.length) grp.add(mesh(lit, M.lattice));
  if (hot.length) grp.add(mesh(hot, glow('#ffcf92', 0.5)));

  if (sign) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 1.5),
      new THREE.MeshBasicMaterial({ map: T.banner(sign), transparent: true, side: THREE.DoubleSide, toneMapped: false }),
    );
    board.position.set(w / 2 - 1.1, wallH - 0.6, face * (d / 2 + 0.9));
    board.rotation.y = face > 0 ? 0 : Math.PI;
    grp.add(board);
    grp.add(new THREE.Mesh(boxGeo(0.9, 0.07, 0.07, w / 2 - 0.7, wallH + 0.2, face * (d / 2 + 0.45)), M.beam));
  }

  for (let k = 0; k < lanterns; k++) {
    const x = -w / 2 + w * ((k + 0.5) / lanterns);
    grp.add(lanternProp(x, wallH - 0.9, face * (d / 2 + 0.75)));
  }

  grp.position.y = ground;
  return grp;
}

/** 院墙：一段带瓦顶的砖墙，沿 X 铺设 */
export function yardWall(length, { height = 2.6, ground = DECK } = {}) {
  const grp = new THREE.Group();
  const wall = new THREE.Mesh(boxGeo(length, height, 0.5, 0, height / 2, 0), M.brick);
  wall.castShadow = true; wall.receiveShadow = true;
  const cap = new THREE.Mesh(
    chineseRoof({ width: length + 0.4, depth: 0.9, height: 0.4, ridgeRatio: 0.98, curve: 0.85, eaveLift: 0.15, overhang: 0.15, hip: false }),
    M.roofDark,
  );
  cap.rotation.y = Math.PI / 2;
  cap.position.y = height;
  grp.add(wall, cap);
  grp.position.y = ground;
  return grp;
}

/* ------------------------------------------------------------------ 牌楼 */

/** 四柱三门牌楼。默认跨 X 轴；跨 Z 轴的街就把整组转 90° */
export function pailou({ span = 11, height = 7.2, title = '', sub = '' } = {}) {
  const grp = new THREE.Group();
  const cols = [-span / 2, -span / 6, span / 6, span / 2];
  cols.forEach((x, i) => {
    const main = i === 0 || i === 3;
    const h = main ? height : height * 0.78;
    const p = new THREE.Mesh(pillarGeo(h, main ? 0.3 : 0.24), M.pillar);
    p.position.set(x, 0, 0);
    p.castShadow = true;
    grp.add(p);
    const base = new THREE.Mesh(boxGeo(0.9, 0.34, 0.9, x, 0.17, 0), M.stoneDressed);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 12), M.stone);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(x + (main ? 0.6 : 0.5), 0.42, 0);
    grp.add(base, drum);
    registerOccluder(base, 2.4);
  });

  const bays = [
    [0, span * 0.42, height],
    [-span * 0.34, span * 0.24, height * 0.78],
    [span * 0.34, span * 0.24, height * 0.78],
  ];
  for (const [cx, w, hh] of bays) {
    grp.add(new THREE.Mesh(boxGeo(w + 0.9, 0.5, 0.7, cx, hh * 0.86, 0), M.beam));
    const brackets = [];
    const nb = Math.max(2, Math.round(w / 1.1));
    for (let i = 0; i <= nb; i++) {
      const b = bracketGeo(0.55);
      b.translate(cx - w / 2 + (w * i) / nb, hh * 0.9, 0);
      brackets.push(b);
    }
    grp.add(mesh(brackets, M.gilt));
    const roof = new THREE.Mesh(
      chineseRoof({ width: w + 1.5, depth: 2.2, height: hh * 0.17, ridgeRatio: 0.34, curve: 0.5, eaveLift: 0.6, overhang: 0.4 }),
      M.roof,
    );
    roof.position.set(cx, hh * 0.94, 0);
    grp.add(roof);
    const ridge = new THREE.Mesh(
      ridgeOrnament({ width: w + 1.5, depth: 2.2, height: hh * 0.17, ridgeRatio: 0.34, overhang: 0.4 }),
      M.ridge,
    );
    ridge.position.set(cx, hh * 0.94, 0);
    grp.add(ridge);
    if (cx === 0 && title) {
      const plate = plaqueMesh(title, w * 0.84, 1.05, { dir: 'h', bg: '#16283c', note: sub });
      plate.position.set(cx, hh * 0.8, 0.44);
      grp.add(plate);
    }
    // 明间檐下挂一排灯，夜里牌楼只剩轮廓与一串火
    for (let i = 0; i <= 3; i++) {
      grp.add(lanternProp(cx - w / 2 + (w * i) / 3, hh * 0.78, 0.35, { r: 0.2 }));
    }
  }
  return grp;
}

/* ------------------------------------------------------------------ 巷门 */

/** 巷门：砖砌门洞 + 一间小屋顶，跨 X 轴 */
export function laneGate({ width = 4.8, height = 3.6, title = '', ground = DECK } = {}) {
  const grp = new THREE.Group();
  const pierW = 1.35, opening = 2.2;
  for (const s of [-1, 1]) {
    grp.add(new THREE.Mesh(boxGeo(pierW, height, 1.0, s * (opening / 2 + pierW / 2), height / 2, 0), M.brick));
  }
  grp.add(new THREE.Mesh(boxGeo(width, 0.4, 1.1, 0, height + 0.2, 0), M.beam));
  const roof = new THREE.Mesh(
    chineseRoof({ width: width + 0.9, depth: 2.0, height: 0.72, ridgeRatio: 0.85, curve: 0.6, eaveLift: 0.3, overhang: 0.3, hip: false }),
    M.roofDark,
  );
  roof.position.y = height + 0.4;
  grp.add(roof);
  if (title) {
    const plate = plaqueMesh(title, 1.7, 0.62, { dir: 'h', bg: '#182636' });
    plate.position.set(0, height - 0.55, 0.58);
    grp.add(plate);
  }
  const lamp = stoneLamp({ height: 2.1 });
  lamp.group.position.set(width / 2 + 0.7, 0, 0.7);
  grp.add(lamp.group);
  grp.position.y = ground;
  grp.userData.lamp = lamp;
  return grp;
}

/* ------------------------------------------------------------------ 石桥 */

/**
 * 单孔石拱桥，跨 X（河在 X 方向上是横渡方向）。
 * 矢高与跨度按运盐河上"高拱以便盐船"的做法取：拱顶离水面 7 m 上下。
 */
export function stoneArchBridge({ span = 34, rise = 7.4, width = 5.4 } = {}) {
  const grp = new THREE.Group();
  const half = span / 2;
  const R = (half * half + rise * rise) / (2 * rise);   // 拱半径
  const cy = rise - R;                                    // 拱心（在水面以下）
  const Rd = R + 1.5;                                     // 桥面弧半径
  const legX = half * 0.86;                              // 券脚落在两岸石台上

  // 实体：桥面弧为上缘，券洞为孔
  const outer = new THREE.Shape();
  const aDeck = Math.acos(clampN(-half / Rd, -1, 1));       // 左端角
  const bDeck = Math.acos(clampN(half / Rd, -1, 1));         // 右端角
  outer.moveTo(-half, 0.2);
  outer.absarc(0, cy, Rd, aDeck, bDeck, true);
  outer.lineTo(half, 0.2);
  outer.lineTo(-half, 0.2);
  const hole = new THREE.Shape();
  const aLeg = Math.acos(clampN(-legX / R, -1, 1));
  const bLeg = Math.acos(clampN(legX / R, -1, 1));
  hole.moveTo(-legX, 0.55);
  hole.absarc(0, cy, R, aLeg, bLeg, true);
  hole.lineTo(legX, 0.55);
  hole.lineTo(-legX, 0.55);
  outer.holes.push(new THREE.Path().setFromPoints(pathPoints(hole)));
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: width, bevelEnabled: false }), M.stoneDressed);
  body.position.z = -width / 2;
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);

  // 桥面石带：贴着桥面弧的一条薄面，铺青石板
  const deckPts = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const a = aDeck + (bDeck - aDeck) * (i / N);
    deckPts.push([Math.cos(a) * (Rd + 0.06), cy + Math.sin(a) * (Rd + 0.06)]);
  }
  const band = [];
  for (let i = 0; i < N; i++) {
    const [x0, y0] = deckPts[i], [x1, y1] = deckPts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = boxGeo(len, 0.16, width + 0.2, (x0 + x1) / 2, (y0 + y1) / 2 + 0.06, 0);
    g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    band.push(g);
  }
  const deckMesh = mesh(band, M.flag);
  deckMesh.receiveShadow = true;
  grp.add(deckMesh);

  // 栏板与望柱：每五级一柱
  for (const side of [-1, 1]) {
    const rails = [];
    for (let i = 0; i < N; i += 2) {
      const [x0, y0] = deckPts[i], [x1, y1] = deckPts[Math.min(N, i + 2)];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const g = boxGeo(len, 0.72, 0.14, (x0 + x1) / 2, (y0 + y1) / 2 + 0.5, side * (width / 2 + 0.02));
      g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
      rails.push(g);
    }
    grp.add(mesh(rails, M.stone));
    for (let i = 0; i <= N; i += 6) {
      const [x, y] = deckPts[Math.min(N, i)];
      const post = new THREE.Mesh(boxGeo(0.2, 1.0, 0.2, x, y + 0.6, side * (width / 2 + 0.02)), M.stoneDressed);
      post.castShadow = true;
      grp.add(post);
    }
  }

  // 两坡的台阶
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const x = s * (half - 0.2 + k * 0.62);
      const y = -0.1 + k * 0.34;
      grp.add(new THREE.Mesh(boxGeo(0.66, 0.36, width, x, y, 0), M.stone));
    }
  }
  return { group: grp, apex: new THREE.Vector3(0, cy + Rd + 0.3, 0) };
}

function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pathPoints(shape) {
  const pts = shape.getPoints(40);
  return pts;
}

/* ------------------------------------------------------------------ 河埠 */

/** 河埠头：从纤道一路下到水面的石阶，侧壁 + 踏面 + 系船石。side=-1 西岸，+1 东岸 */
export function ghatSteps({ z = 0, ground = DECK, width = 3.2, toWater = 0, side = -1 } = {}) {
  const grp = new THREE.Group();
  const drop = ground - toWater;
  const n = Math.max(3, Math.round(drop / 0.42));
  const run = drop / Math.tan(0.62);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const x = side * (HW + run * t);
    const y = ground - drop * (t + 0.5 / n);
    grp.add(new THREE.Mesh(boxGeo(run / n + 0.1, drop / n, width, x, y, 0), M.stone));
  }
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(boxGeo(run + 0.4, drop + 0.5, 0.3, side * (HW + run / 2), ground - drop / 2 + 0.2, s * (width / 2 + 0.15)), M.stoneDark);
    wall.castShadow = true;
    grp.add(wall);
  }
  grp.position.z = z;
  grp.add(quayFurniture(side * (HW + run + 0.4), width / 2 - 0.4));
  return { group: grp, foot: new THREE.Vector3(side * (HW + run + 0.6), toWater + 0.1, z) };
}
