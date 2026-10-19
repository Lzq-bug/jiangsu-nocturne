import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, mesh, lit, glow, rr, box, cyl, loft, roundedSection, quadGrid, blobGeometry, inscribed,
} from './kit.js';
import * as T from './textures.js';
import { gabledRoof, pavilionRoof } from './roofs.js';
import { SITES, terrainHeight, TOP_Y, FEATURES, PLAIN } from './data.js';

/**
 * 后峰顶上的诸迹与山门口的牌楼、前峰下的铁瓮城标识。
 * 每座屋子都把"楼面高 / 平座高 / 顶高"回写进 built，机位从这些数里取站脚
 * （见 main.js resolveStations），所以改了形制，机位自己跟着挪。
 */

const TILE = M.roof, TILEW = M.roofWarm;

export function buildArchitecture(scene) {
  const group = new THREE.Group();
  group.name = 'architecture';
  const built = {};
  const lamps = [];      // 挂灯点：{x,y,z,kind,t,group}
  const windows = [];    // 发光窗片（材质分组用）

  built.temple = buildTemple(group, lamps, windows);
  built.duoJing = buildDuoJingLou(group, lamps, windows);
  built.beiguLou = buildBeiguLou(group, lamps, windows);
  built.ironTower = buildIronTower(group, lamps, windows);
  built.jiangTing = buildJiangTing(group, lamps);
  built.stele = buildSteleCorridor(group, lamps);
  built.stones = buildStones(group);
  built.gate = buildGate(group, lamps);
  built.tiebeng = buildTieBeng(group, lamps);

  scene.add(group);
  return { group, built, lamps, windows };
}

/* ------------------------------------------------------------------ 甘露寺 */

/**
 * 山门—前殿—大雄宝殿一串，纵轴略斜；四面黄墙把顶平台围出一院。
 * 形制取江南寺观通例，殿名与匾额为补配（1010 年诏徙峰顶这件事是可核的）。
 */
function buildTemple(grp, lamps, windows) {
  const S = SITES.temple;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = S.rot;
  const deck = S.y + 0.14;

  // 台基（两层须弥座）
  const base = [
    box(46, 0.9, 58, 0, deck - 0.75, 0),
    box(44, 0.7, 56, 0, deck + 0.15, 0),
  ];
  g.add(mesh(base, M.stone));
  const floorY = deck + 0.85;

  /* 黄墙围院：东西两长墙 + 南墙开门 */
  const wallParts = [];
  const wallH = 5.2;
  wallParts.push(box(46, wallH, 1.0, 0, floorY, 28));                 // 北墙（临江一侧）
  for (const sx of [-1, 1]) wallParts.push(box(1.0, wallH, 56, sx * 22.5, floorY, 0));
  wallParts.push(box(17, wallH, 1.0, -14.5, floorY, -28));
  wallParts.push(box(17, wallH, 1.0, 14.5, wallH * 0 + floorY, -28));
  const wallMat = M.templeWall;
  const wallM = mesh(wallParts, wallMat);
  wallM.name = 'temple-wall';
  wallM.castShadow = true; wallM.receiveShadow = true;
  g.add(wallM);
  // 墙顶黛瓦压顶
  const cap = [];
  for (const [w, d, x, z] of [[48, 1.6, 0, 28], [1.6, 58, -22.5, 0], [1.6, 58, 22.5, 0], [18, 1.6, -14.5, -28], [18, 1.6, 14.5, -28]]) {
    cap.push(box(w, 0.5, d, x, floorY + wallH, z));
  }
  g.add(mesh(cap, TILE));

  /* 山门（门楼高耸） */
  const gate = new THREE.Group();
  gate.position.set(0, floorY, -27);
  const gd = [box(15, 6.4, 6.2, 0, 0, 0), box(16.6, 0.8, 7.4, 0, 6.4, 0)];
  gate.add(mesh(gd, M.templeWall));
  for (const sx of [-5.4, 5.4]) gate.add(mesh([cyl(0.34, 0.3, 6.2, 10, sx, 0, -3.4)], M.timberDark));
  const gateRoof = gabledRoof({ span: 17.6, depth: 8.6, rise: 3.0, eaveY: 7.2, lift: 0.5, cornerOut: 0.9 });
  gate.add(mesh(gateRoof.surface, TILE));
  if (gateRoof.ridge) gate.add(mesh(gateRoof.ridge, TILEW));
  const gatePlaque = inscribed('古甘露禅寺', 5.6, 1.5, { ink: '#f0e2c4', size: 0.8, glow: '#4a3a16', ei: 0.5 });
  gatePlaque.position.set(0, 4.6, -3.5);
  gatePlaque.rotation.y = Math.PI;
  gate.add(gatePlaque);
  g.add(gate);
  lamps.push({ x: S.x, y: floorY + 5.4, z: S.z - 27, kind: 'lantern', t: 0.06, g: 'gate' });

  /* 前殿（天王殿）与大雄宝殿 */
  const hall = buildHall({ w: 21, d: 13, h: 7.4, rise: 3.9, name: 'qian' });
  hall.position.set(0, floorY, -8);
  g.add(hall);
  windows.push(...hall.userData.windows);

  const main = buildHall({ w: 25, d: 15, h: 8.6, rise: 4.4, name: 'daxiong', bigger: true });
  main.position.set(0, floorY, 12);
  g.add(main);
  windows.push(...main.userData.windows);

  // 殿前月台与香炉
  const terrace = [box(27, 0.6, 24, 0, floorY + 0.3, 2)];
  g.add(mesh(terrace, M.paving));
  const incense = new THREE.Group();
  incense.add(mesh([
    cyl(1.0, 0.8, 0.5, 12, 0, 0.9, 0),
    cyl(1.3, 1.3, 0.35, 12, 0, 0.6, 0),
    box(0.3, 0.9, 0.3, -1.2, 0.9, 0), box(0.3, 0.9, 0.3, 1.2, 0.9, 0),
  ], M.bronze));
  incense.position.set(0, floorY + 0.6, -1);
  g.add(incense);

  // 两殿之间的庭院灯与墙上的漏光
  for (const sx of [-1, 1]) {
    lamps.push({ x: S.x + sx * 15, y: floorY + 3.0, z: S.z + 2, kind: 'lantern', t: 0.2, g: 'temple' });
  }
  lamps.push({ x: S.x, y: floorY + 7.0, z: S.z + 12, kind: 'flood', t: 0.24, g: 'temple' });

  grp.add(g);
  return { group: g, floorY, deck: deck, hallY: floorY + 8.6, center: [S.x, S.z] };
}

/** 一座殿：柱网 + 墙体 + 门窗 + 屋顶，窗片回写 userData.windows */
function buildHall({ w, d, h, rise, name, bigger = false }) {
  const g = new THREE.Group();
  g.name = `hall-${name}`;
  const cols = [], walls = [], win = [];
  const nx = Math.max(3, Math.round(w / 5.4)), nz = Math.max(2, Math.round(d / 5.4));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const x = -w / 2 + i * (w / nx), z = -d / 2 + j * (d / nz);
      cols.push(cyl(0.42, 0.36, h, 10, x, 0, z));
    }
  }
  // 墙（后墙与山墙实砌，前墙开门窗）
  walls.push(box(w + 0.6, h, 0.7, 0, h / 2, d / 2));
  for (const sx of [-1, 1]) walls.push(box(0.7, h, d, sx * (w / 2), h / 2, 0));
  walls.push(box(w * 0.34, h * 0.42, 0.6, 0, h * 0.21, -d / 2));
  for (const sx of [-1, 1]) walls.push(box(w * 0.2, h * 0.55, 0.6, sx * w * 0.34, h * 0.275, -d / 2));
  g.add(mesh(cols, M.timberDark));
  g.add(mesh(walls, M.plaster));

  // 门窗：发光片贴在洞口后
  const doorH = h * 0.62;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * w * 0.2;
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.14, doorH * 0.86),
      lit('#f6dcb4', { rough: 0.9, emissive: '#ffb977', ei: 0.42 }),
    );
    pane.position.set(x, doorH * 0.44, -d / 2 - 0.34);
    pane.userData.kind = 'window';
    win.push(pane);
  }
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const lat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), M.latticeLight);
      lat.position.set(sx * (w / 2 - 1.2), h * 0.55, sz * (d / 2 - 1.6));
      lat.rotation.y = Math.PI / 2;
      lat.userData.kind = 'window';
      win.push(lat);
    }
  }
  for (const p of win) g.add(p);

  // 额枋 + 屋顶
  g.add(mesh([box(w + 1.4, 0.7, 0.8, 0, h - 0.35, -d / 2 - 0.3)], M.timber));
  const roof = gabledRoof({ span: w + 2.6, depth: d + 2.6, rise, eaveY: h, lift: 0.46, cornerOut: bigger ? 1.1 : 0.8 });
  g.add(mesh(roof.surface, TILE));
  if (roof.ridge) g.add(mesh(roof.ridge, TILEW));
  for (const sx of [-1, 1]) {
    const end = quadGrid((u, v) => {
      const zz = (u - 0.5) * (d + 1.2);
      const top = h + rise * Math.max(0.06, 1 - Math.abs(zz / ((d + 1.2) / 2)) * 0.8);
      return [sx * (w / 2 + 0.35), v * 0 + THREE.MathUtils.lerp(0, top, v), zz];
    }, 12, 2, { spanU: d, spanV: h + rise });
    g.add(mesh(end, M.plaster));
  }
  const plaque = inscribed(bigger ? '大雄宝殿' : '天王殿', 3.4, 1.0, { ink: '#efe4c8', size: 0.78, glow: '#3d3212', ei: 0.4 });
  plaque.position.set(0, h * 0.78, -d / 2 - 0.55);
  plaque.rotation.y = Math.PI;
  g.add(plaque);

  g.userData.windows = win;
  return g;
}

/* ------------------------------------------------------------------ 多景楼 */

/**
 * 二层、回廊四通、面面皆景（诸源只给这一句，通高属写意）。
 * 周圈平座与四向回廊是这一站要拍的东西。
 */
function buildDuoJing(grp, lamps, windows) {
  const S = SITES.duoJing;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = S.rot;
  const floorY = S.y + 0.16;

  const w = 20, d = 15;
  g.add(mesh([box(w + 3.4, 0.8, d + 3.4, 0, floorY - 0.4, 0)], M.stone));
  const f1 = floorY + 0.4;

  const cols = [];
  const nx = 4, nz = 3;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      cols.push(cyl(0.32, 0.28, 4.2, 8, -w / 2 + i * (w / nx), f1, -d / 2 + j * (d / nz)));
    }
  }
  // 外圈回廊柱
  for (let i = 0; i <= 6; i++) {
    const x = -w / 2 - 1.6 + i * ((w + 3.2) / 6);
    for (const sz of [-1, 1]) cols.push(cyl(0.26, 0.24, 3.8, 8, x, f1, sz * (d / 2 + 1.6)));
  }
  for (let j = 0; j <= 4; j++) {
    const z = -d / 2 - 1.6 + j * ((d + 3.2) / 4);
    for (const sx of [-1, 1]) cols.push(cyl(0.26, 0.24, 3.8, 8, sx * (w / 2 + 1.6), f1, z));
  }
  g.add(mesh(cols, M.timber));

  const body = [
    box(w - 1.4, 3.9, d - 1.4, 0, f1 + 0.1, 0),
    box(w + 0.2, 0.5, d + 0.2, 0, f1 + 4.0, 0),          // 平座（二层楼面）
    box(w - 2.6, 3.4, d - 2.6, 0, f1 + 4.5, 0),         // 二层身
  ];
  g.add(mesh(body, M.plaster));

  const deckEdge = [];
  for (const sx of [-1, 1]) deckEdge.push(box(0.24, 0.9, d + 3.2, sx * (w / 2 + 1.5), f1 + 4.5, 0));
  for (const sz of [-1, 1]) deckEdge.push(box(w + 3.2, 0.9, 0.24, 0, f1 + 4.5, sz * (d / 2 + 1.5)));
  g.add(mesh(deckEdge, M.timberDark));

  // 两层屋顶：下层一圈腰檐，上层歇山近似为两坡 + 山墙
  const skirt = gabledRoof({ span: w + 4.2, depth: d + 4.2, rise: 2.2, eaveY: f1 + 4.0, lift: 0.5, cornerOut: 0.9, withRidge: false });
  g.add(mesh(skirt.surface, TILE));
  const top = gabledRoof({ span: w - 0.6, depth: d + 0.6, rise: 2.8, eaveY: f1 + 7.9, lift: 0.55, cornerOut: 0.8 });
  g.add(mesh(top.surface, TILE));
  if (top.ridge) g.add(mesh(top.ridge, TILEW));

  // 四面的窗与灯
  for (const [sx, sz, ry] of [[-1, 0, Math.PI / 2], [1, 0, Math.PI / 2], [0, -1, 0], [0, 1, 0]]) {
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 4.6;
      for (const lv of [f1 + 2.2, f1 + 6.0]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), M.latticeLight);
        p.position.set(sx * (w / 2 - 0.6) + (sz ? off : 0), lv, sz * (d / 2 - 0.6) + (sx ? off : 0));
        p.rotation.y = ry;
        p.userData.kind = 'window';
        windows.push(p); g.add(p);
      }
    }
  }
  const plaque = inscribed('多景楼', 3.0, 1.05, { ink: '#efe4c8', size: 0.8, glow: '#3a2f12', ei: 0.45 });
  plaque.position.set(0, f1 + 3.3, -d / 2 - 0.9);
  plaque.rotation.y = Math.PI;
  g.add(plaque);

  lamps.push({ x: S.x, y: f1 + 5.0, z: S.z - d / 2 - 2.2, kind: 'lantern', t: 0.52, g: 'duojing' });
  lamps.push({ x: S.x, y: f1 + 5.0, z: S.z + d / 2 + 2.2, kind: 'lantern', t: 0.54, g: 'duojing' });

  grp.add(g);
  return { group: g, floorY: f1 + 4.5, deck: f1, roofY: f1 + 7.9 + 2.8 };
}

/* ------------------------------------------------------------------ 北固楼 */

/**
 * 明二暗三、三重檐、仿宋十字脊，通高 19.9 米（可核），建筑面积 420 多平方米。
 * 面阔与进深无实测，按 420㎡ 摊两层明层给个能站人的尺度（写意）。
 */
function buildBeiguLou(grp, lamps, windows) {
  const S = SITES.beiguLou;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = S.rot;
  const baseY = S.y - 0.2;

  // 台基两层
  g.add(mesh([
    box(30, 1.1, 26, 0, baseY - 0.55, 0),
    box(27.5, 0.9, 23.5, 0, baseY + 0.55, 0),
  ], M.stone));
  const f0 = baseY + 1.0;

  const W = 21, D = 18;
  const storeys = [
    { y: f0, h: 5.4, w: W, d: D },                 // 明一层
    { y: f0 + 5.4, h: 3.0, w: W - 3.4, d: D - 3.0 }, // 暗层（平座暗层，窗窄）
    { y: f0 + 8.4, h: 5.0, w: W - 1.2, d: D - 1.0 }, // 明二层
    { y: f0 + 13.4, h: 2.4, w: W - 5.2, d: D - 4.6 }, // 暗三层
    { y: f0 + 15.8, h: 1.6, w: W - 6.4, d: D - 6.0 }, // 顶层身
  ];
  const cols = [], bodies = [];
  for (const s of storeys) {
    bodies.push(box(s.w - 1.6, s.h * 0.92, s.d - 1.6, 0, s.y, 0));
    bodies.push(box(s.w + 0.4, 0.42, s.d + 0.4, 0, s.y + s.h, 0));
    const nx = Math.max(2, Math.round(s.w / 5.2)), nz = Math.max(2, Math.round(s.d / 5.2));
    for (let i = 0; i <= nx; i++) {
      for (const sz of [-1, 1]) {
        cols.push(cyl(0.3, 0.26, s.h, 8, -s.w / 2 + i * (s.w / nx), s.y, sz * (s.d / 2 + 0.9)));
      }
    }
    for (let j = 1; j < nz; j++) {
      for (const sx of [-1, 1]) {
        cols.push(cyl(0.3, 0.26, s.h, 8, sx * (s.w / 2 + 0.9), s.y, -s.d / 2 + j * (s.d / nz)));
      }
    }
  }
  g.add(mesh(cols, M.timber));
  g.add(mesh(bodies, M.plaster));

  // 三重檐：下檐腰檐（十字脊＝两组两坡屋顶正交）
  const eaves = [
    { y: f0 + 5.4, span: W + 7.2, depth: D + 6.0, rise: 3.0 },
    { y: f0 + 13.4, span: W + 3.2, depth: D + 2.2, rise: 2.6 },
    { y: f0 + 15.8, span: W - 1.0, depth: D - 0.6, rise: 3.2 },
  ];
  for (const e of eaves) {
    const a = gabledRoof({ span: e.span, depth: e.depth, rise: e.rise * 0.86, eaveY: e.y, lift: 0.62, cornerOut: 1.25, withRidge: false });
    g.add(mesh(a.surface, TILE));
    const b = gabledRoof({
      span: e.depth, depth: e.span, rise: e.rise * 0.86, eaveY: e.y, lift: 0.62, cornerOut: 1.25, withRidge: false,
    });
    b.surface.rotateY(Math.PI / 2);
    g.add(mesh(b.surface, TILE));
  }
  // 顶：十字脊 + 脊上宝顶
  const crown = gabledRoof({ span: W - 1.0, depth: D - 0.6, rise: 3.4, eaveY: f0 + 18.0, lift: 0.7, cornerOut: 1.1, withRidge: true });
  g.add(mesh(crown.surface, TILE));
  if (crown.ridge) g.add(mesh(crown.ridge, TILEW));
  const crown2 = gabledRoof({ span: D - 0.6, depth: W - 1.0, rise: 3.4, eaveY: f0 + 18.0, lift: 0.7, cornerOut: 1.1, withRidge: true });
  crown2.surface.rotateY(Math.PI / 2);
  g.add(mesh(crown2.surface, TILE));
  if (crown2.ridge) {
    const r2 = crown2.ridge.clone(); r2.rotateY(Math.PI / 2);
    g.add(mesh(r2, TILEW));
  }
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 9), M.gold);
  finial.position.set(0, f0 + 18.0 + 3.4 + 0.9, 0);
  g.add(finial);

  // 平座栏杆（二层可站人处）
  const rail = [];
  const deckY = f0 + 8.4;
  for (const sx of [-1, 1]) rail.push(box(0.22, 0.95, D + 2.0, sx * (W / 2 + 1.2), deckY, 0));
  for (const sz of [-1, 1]) rail.push(box(W + 2.4, 0.95, 0.22, 0, deckY, sz * (D / 2 + 1.0)));
  g.add(mesh(rail, M.timberDark));

  // 窗：四面各三层，明层亮、暗层窄
  const winRows = [f0 + 3.2, f0 + 6.6, f0 + 11.0, f0 + 14.6, f0 + 17.0];
  for (const lv of winRows) {
    const n = lv < f0 + 8 ? 5 : 4;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * (sx ? W / n : D / n);
        const p = new THREE.Mesh(
          new THREE.PlaneGeometry(sx ? 1.6 : 1.6, lv > f0 + 13 ? 1.0 : 1.5),
          lit('#ffe3bb', { rough: 0.9, emissive: '#ffbd7c', ei: 0.5 }),
        );
        p.position.set(sx * (W / 2 + 0.1) + (sz ? off : 0), lv, sz * (D / 2 + 0.1) + (sx ? off : 0));
        p.rotation.y = sx ? Math.PI / 2 : 0;
        p.userData.kind = 'window';
        p.userData.level = winRows.indexOf(lv);
        windows.push(p); g.add(p);
      }
    }
  }

  const plaque = inscribed('北固楼', 3.6, 1.3, { ink: '#f2e6ca', size: 0.8, glow: '#42350f', ei: 0.5 });
  plaque.position.set(0, f0 + 4.1, -D / 2 - 1.6);
  plaque.rotation.y = Math.PI;
  g.add(plaque);

  lamps.push({ x: S.x, y: f0 + 4.4, z: S.z - D / 2 - 2.4, kind: 'lantern', t: 1.0, g: 'lou' });
  lamps.push({ x: S.x, y: f0 + 12.6, z: S.z - D / 2 - 1.4, kind: 'lantern', t: 1.0, g: 'lou' });

  grp.add(g);
  const topY = f0 + 18.0 + 3.4 + 1.6;
  return {
    group: g, floorY: deckY + 0.95, deck: deckY, baseY: f0, topY,
    /** 通高 19.9 米：自台基顶到宝顶核对用 */
    overall: topY - (baseY - 0.55),
    center: [S.x, S.z],
  };
}

/* ------------------------------------------------------------------ 铁塔 */

/**
 * 今存四层：一、二层宋物，三、四层明铸（诸源说唐宝历始、宋元丰九级、明七级）。
 * 层数可照志书摆，尺寸与塔身细部属写意；tier 由 props 逐层点亮。
 */
function buildIronTower(grp, lamps, windows) {
  const S = SITES.ironTower;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  const f = S.y + 0.12;

  const parts = [];
  const tiers = [];
  let y = f;
  let half = 2.6;
  const H = [1.75, 1.55, 1.35, 1.15];
  for (let i = 0; i < 4; i++) {
    parts.push(box(half * 2, H[i], half * 2, 0, y, 0));
    // 每层檐：一圈外挑的窄板
    parts.push(box(half * 2 + 1.0, 0.26, half * 2 + 1.0, 0, y + H[i], 0));
    tiers.push({ y0: y, y1: y + H[i] + 0.26, half });
    y += H[i] + 0.26;
    half *= 0.82;
  }
  parts.push(cyl(0.34, 0.2, 1.1, 8, 0, y, 0));
  const塔 = mesh(parts, M.ink);
  塔.name = 'iron-tower';
  g.add(塔);
  const spire = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), M.bronze);
  spire.position.set(0, y + 1.3, 0);
  g.add(spire);

  // 龛影：每层四面一小片发光面（由 tier 控制）
  const glows = [];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i], cy = (t.y0 + t.y1) / 2;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8),
        lit('#cfd8dc', { rough: 0.9, emissive: '#ffca8e', ei: 0.3 }));
      p.position.set(sx * (t.half + 0.02), cy, sz * (t.half + 0.02));
      p.rotation.y = sx ? Math.PI / 2 : 0;
      p.userData.kind = 'tier';
      p.userData.level = i;
      glows.push(p); g.add(p);
    }
  }

  // 清晖亭：塔旁一座小方亭
  const qh = new THREE.Group();
  qh.position.set(-6.4, f, 3.6);
  const qc = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) qc.push(cyl(0.24, 0.22, 3.1, 8, sx * 2.0, 0, sz * 2.0));
  qh.add(mesh(qc, M.timber));
  qh.add(mesh([box(4.8, 0.3, 4.8, 0, 0.15, 0)], M.stone));
  const qroof = pavilionRoof({ half: 3.2, rise: 1.8, eaveY: 3.1, lift: 0.8, cornerOut: 0.7, sides: 4, perSide: 5, nv: 7 });
  qh.add(mesh(qroof.surface, TILE));
  g.add(qh);

  lamps.push({ x: S.x, y: f + 1.2, z: S.z + 4.4, kind: 'flood', t: 0.40, g: 'tower' });

  grp.add(g);
  return { group: g, tiers, topY: y + 1.7, glows, floorY: f };
}

/* ------------------------------------------------------------------ 祭江亭 */

/** 石柱方亭：崖嘴上的一块小台，柱子是真石头（旧志："石柱方亭"） */
function buildJiangTing(grp, lamps) {
  const S = SITES.jiangTing;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = S.rot;
  const f = S.y + 0.1;

  g.add(mesh([box(8.6, 0.7, 8.6, 0, f - 0.35, 0), box(9.6, 0.4, 9.6, 0, f - 0.95, 0)], M.stone));
  const cols = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cols.push(cyl(0.32, 0.3, 3.5, 10, sx * 2.9, f, sz * 2.9));
  g.add(mesh(cols, M.stone));
  const roof = pavilionRoof({ half: 4.4, rise: 2.1, eaveY: f + 3.5, lift: 0.95, cornerOut: 0.8, sides: 4, perSide: 5, nv: 7 });
  g.add(mesh(roof.surface, TILE));
  const宝 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.stone);
  宝.position.set(0, f + 3.5 + 2.1 + 0.3, 0);
  g.add(宝);
  // 栏
  const rail = [];
  for (const sx of [-1, 1]) rail.push(box(0.18, 0.75, 8.2, sx * 4.1, f + 0.35, 0));
  for (const sz of [-1, 1]) rail.push(box(8.2, 0.75, 0.18, 0, f + 0.35, sz * 4.1));
  g.add(mesh(rail, M.stone));

  lamps.push({ x: S.x, y: f + 2.4, z: S.z, kind: 'lantern', t: 0.34, g: 'temple' });
  lamps.push({ x: S.x, y: f - 0.4, z: S.z + 2.4, kind: 'uplight', t: 0.36, g: 'temple' });

  grp.add(g);
  return { group: g, floorY: f, deck: f };
}

/* ---------------------------------------------------------- 第一江山 廊壁 */

/** 寺东一字长廊，壁上嵌一方石刻；灯不是照字，是贴着壁横扫 */
function buildSteleCorridor(grp, lamps) {
  const S = SITES.steleWall;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = S.rot;
  const f = S.y + 0.1;
  const L = 26, H = 4.4;

  g.add(mesh([box(L, H, 0.9, 0, f + H / 2, 0)], M.templeWall));
  g.add(mesh([box(L + 1.2, 0.55, 1.7, 0, f + H, 0)], TILE));
  const cols = [];
  for (let i = 0; i <= 6; i++) cols.push(cyl(0.26, 0.24, H - 0.6, 8, -L / 2 + i * (L / 6), f, -1.9));
  g.add(mesh(cols, M.timber));
  const roof = gabledRoof({ span: L + 1.6, depth: 4.2, rise: 1.5, eaveY: f + H + 0.5, lift: 0.4, cornerOut: 0.6 });
  g.add(mesh(roof.surface, TILE));
  if (roof.ridge) g.add(mesh(roof.ridge, TILEW));

  // 石刻：一块嵌在壁上的石碑 + 四字
  const slab = mesh([box(6.4, 2.5, 0.34, 0, f + 2.2, -0.62)], M.stele);
  g.add(slab);
  const word = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 1.9),
    new THREE.MeshBasicMaterial({
      map: T.calligraphy('第一江山', { vertical: false, cols: 1, w: 1024, h: 340, ink: '#e6ecec', size: 0.84 }),
      transparent: true, color: new THREE.Color('#a7b1b2'),
    }),
  );
  word.material.toneMapped = false;
  word.position.set(0, f + 2.2, -0.82);
  word.rotation.y = Math.PI;
  g.add(word);

  lamps.push({ x: S.x - 7.5, y: f + 0.6, z: S.z - 2.6, kind: 'rake', t: 0.30, g: 'stele' });
  lamps.push({ x: S.x + 7.5, y: f + 0.6, z: S.z - 2.6, kind: 'rake', t: 0.32, g: 'stele' });

  grp.add(g);
  return { group: g, word, floorY: f };
}

/* -------------------------------------------------------------- 狠石与试剑石 */

function buildStones(grp) {
  const S = SITES.henStone;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);

  // 伏羊：一块横卧的巨石，头朝东
  const羊 = blobGeometry(2.4, { detail: 2, amp: 0.22, squash: 0.6, seed: 31 });
  羊.scale(1.5, 1, 1.05);
  羊.translate(0, 0.9, 0);
  const head = blobGeometry(1.05, { detail: 2, amp: 0.2, squash: 0.8, seed: 77 });
  head.translate(3.4, 1.5, 0);
  const羊m = mesh([羊, head], M.rockPlain);
  羊m.name = 'hen-shi';
  羊m.castShadow = true;
  g.add(羊m);
  // 腹上刻"狠石"
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.7),
    new THREE.MeshBasicMaterial({
      map: T.calligraphy('狠石', { vertical: false, cols: 1, w: 420, h: 200, ink: '#dfe6e6', size: 0.84 }),
      transparent: true, color: new THREE.Color('#93a09f'),
    }),
  );
  tag.material.toneMapped = false;
  tag.position.set(0.4, 1.85, 1.32);
  tag.rotation.x = -0.55;
  g.add(tag);

  // 试剑石：一分为二，缝平如削
  for (const sx of [-1, 1]) {
    const b = blobGeometry(2.2, { detail: 2, amp: 0.24, squash: 0.72, seed: 120 + sx * 13 });
    b.scale(1.05, 1, 0.86);
    b.translate(sx * 1.28, 1.3, -7.4);
    g.add(mesh(b, M.rockHill));
  }
  grp.add(g);
  return { group: g };
}

/* ------------------------------------------------------------------ 牌楼 */

/** 上山口的石牌楼：额书"北固山"（山名可核，牌楼形制与额书者皆补配） */
function buildGate(grp, lamps) {
  const S = SITES.gate;
  const g = new THREE.Group();
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = S.rot;
  const f = terrainHeight(S.x, S.z) + 0.1;

  const parts = [];
  for (const sx of [-8.2, -2.8, 2.8, 8.2]) parts.push(box(1.1, 6.8, 1.1, sx, f, 0));
  parts.push(box(19.4, 1.0, 1.3, 0, f + 6.8, 0));
  parts.push(box(15.0, 0.8, 1.2, 0, f + 8.4, 0));
  for (const sx of [-9.9, 9.9]) parts.push(box(1.4, 1.5, 1.4, sx, f + 7.8, 0));
  g.add(mesh(parts, M.stone));
  const roof = gabledRoof({ span: 20.4, depth: 2.6, rise: 1.2, eaveY: f + 7.8, lift: 0.5, cornerOut: 0.8 });
  g.add(mesh(roof.surface, TILE));
  const r2 = gabledRoof({ span: 16.0, depth: 2.2, rise: 1.1, eaveY: f + 9.2, lift: 0.5, cornerOut: 0.7 });
  g.add(mesh(r2.surface, TILE));
  const plaque = inscribed('北固山', 4.2, 1.4, { ink: '#e9eef0', size: 0.82, board: true, glow: '#20262c', ei: 0.3 });
  plaque.position.set(0, f + 7.4, -0.8);
  plaque.rotation.y = Math.PI;
  g.add(plaque);

  lamps.push({ x: S.x - 6, y: f + 5.4, z: S.z, kind: 'lantern', t: 0.06, g: 'gate' });
  lamps.push({ x: S.x + 6, y: f + 5.4, z: S.z, kind: 'lantern', t: 0.06, g: 'gate' });

  grp.add(g);
  return { group: g, floorY: f };
}

/* -------------------------------------------------------------- 铁瓮城标识 */

/**
 * 城址南北 480 米、东西最宽 300 米（可核），垣在地面下。
 * 这里只沿它的位置压一条低矮的灯沟与一段探沟断面——是标识，不是复原。
 */
function buildTieBeng(grp, lamps) {
  const cx = TOP.x + FEATURES.tiebeng.dx, cz = TOP.z + FEATURES.tiebeng.dz;
  const g = new THREE.Group();
  g.name = 'tiebeng';
  const NX = 480, EW = 300;

  const wall = [];
  const ring = 54;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const x = cx + Math.cos(a) * (EW / 2), z = cz + Math.sin(a) * (NX / 2);
    const y = terrainHeight(x, z);
    const seg = new THREE.BoxGeometry(12, 0.55, 3.2);
    seg.rotateY(-a);
    seg.translate(x, y + 0.1, z);
    wall.push(seg);
    lamps.push({ x, y: y + 0.9, z, kind: 'trench', t: 0.14, g: 'gate' });
  }
  g.add(mesh(wall, M.cement));
  // 探沟断面：两条槽
  const cut = [];
  for (const dz of [-90, 60]) {
    cut.push(box(EW * 0.7, 0.5, 6.2, cx, terrainHeight(cx, cz + dz) + 0.05, cz + dz));
  }
  g.add(mesh(cut, M.dark));
  grp.add(g);
  return { group: g, cx, cz };
}
