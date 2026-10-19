import * as THREE from 'three';
import {
  M, glow, box, mesh, registerOccluder,
  chineseRoof, ridgeOrnament, pillarGeo,
  wallWithArches, archFace, crenellation, parapet, rampGeo, plinthGeo,
} from './kit.js';
import { SITE, LEVEL, GATE_Z } from './data.js';
import * as T from './textures.js';

const W = SITE.wall;
const WG = SITE.waterGate;
const LG = SITE.landGate;

/** 城垣立面在局部 XY（X 沿墙、Y 向上），这里全部按世界坐标摆放 */
const FACE_S = W.z + W.t / 2;
const FACE_N = W.z - W.t / 2;

/** 一段带券洞的墙，输入都是世界坐标 */
function curtain(x0, x1, { y0, y1, z, t, openings = [] } = {}) {
  const cx = (x0 + x1) / 2;
  const g = wallWithArches({
    width: x1 - x0,
    height: y1 - y0,
    thick: t,
    sill: 0.2,
    curveSegments: 14,
    openings: openings.map((o) => ({
      at: (o.at === undefined ? cx : o.at) - cx,
      width: o.width,
      bottom: o.sill - y0,
      spring: o.spring - y0,
    })),
  });
  g.translate(cx, y0, z);
  return g;
}

/** 券脸石：落在墙面外侧，spring/sill 都是世界标高 */
function faceAt({ x, y, spring, radius, z, ring = 0.54, depth = 0.42, count = 17 }) {
  const g = archFace(radius, { ring, depth, count, spring: spring - y, jamb: 1.0 });
  g.translate(x, y, z);
  return g;
}

/** 石刻题额：字口刻在条石上，不发光，靠洞内灯火把它照亮 */
function carving(text, w, h, { dir = 'h' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: T.carving(text, { dir }), roughness: 0.9, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/* ------------------------------------------------------------------ 城楼 */
function gateTower(lights) {
  const { width, depth, floorH, roofH } = LG.tower;
  const brick = [], wood = [], stone = [], leaves = [];
  const y0 = LG.top;

  stone.push(box(width + 2.4, 0.9, depth + 1.8, 0, y0 + 0.45, 0));
  stone.push(box(width + 1.2, 0.26, depth + 0.9, 0, y0 + 1.03, 0));
  const floor = y0 + 1.16;

  for (let i = 0; i <= 3; i++) {
    const x = -width / 2 + (width * i) / 3;
    for (const z of [-depth / 2 + 0.55, depth / 2 - 0.55]) {
      const g = pillarGeo(floorH, 0.29);
      g.translate(x, floor, z);
      wood.push(g);
    }
  }
  // 山墙与后墙砌到檐下，南面明间做门楼人口
  brick.push(box(width, floorH * 0.94, 0.5, 0, floor + floorH * 0.47, -depth / 2 + 0.25));
  for (const s of [-1, 1]) {
    brick.push(box(0.5, floorH * 0.94, depth - 0.5, s * (width / 2 - 0.25), floor + floorH * 0.47, 0));
  }
  brick.push(box(width * 0.98, 0.66, 0.6, 0, floor + floorH - 0.16, depth / 2 - 0.35));
  // 明间的格子门：夜里从门缝里漏出一点暖光
  for (let i = 0; i < 3; i++) {
    const w = (width - 3.4) / 3;
    const x = -width / 2 + 1.7 + w * (i + 0.5);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, floorH * 0.62), M.lattice);
    leaf.position.set(x, floor + floorH * 0.31, depth / 2 - 0.5);
    leaves.push(leaf);
  }

  const eave = floor + floorH;
  const roof = new THREE.Mesh(
    chineseRoof({ width, depth, height: roofH, ridgeRatio: 0.34, overhang: 1.2 }),
    M.roof,
  );
  roof.position.set(0, eave + 0.3, 0);
  roof.castShadow = true;
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width, depth, height: roofH, ridgeRatio: 0.34, overhang: 1.2 }),
    M.ridge,
  );
  ridge.position.copy(roof.position);

  // 檐下一排斗拱，夜里只读成一道阴影带
  for (let i = 0; i <= 9; i++) {
    const x = -width / 2 - 0.4 + ((width + 0.8) * i) / 9;
    brick.push(box(0.5, 0.5, 0.62, x, eave - 0.1, depth / 2 + 0.22));
  }

  const g = new THREE.Group();
  g.add(mesh(brick, M.brickWarm), mesh(wood, M.pillar), mesh(stone, M.stoneDressed), roof, ridge);
  for (const l of leaves) g.add(l);
  for (const s of [-1, 1]) {
    lights.push({ p: [s * 3.6, eave - 1.0, depth / 2 + 0.5], color: '#ffcf92', halo: 2.1, column: 5 });
  }
  return { group: g, eaveY: eave, towerTop: eave + roofH };
}

/* ------------------------------------------------------------------ 瓮城 */
function barbican(lights) {
  const B = LG.barbican;
  const z1 = B.cz0 + B.run;
  const h = B.top - LEVEL.quay;
  const r = B.gate.width / 2;
  const spring = LEVEL.quay + 2.8;
  const panels = [], caps = [], wood = [], tiles = [];

  // 平面略呈方形的瓮城：两翼向南，前脸正中开一门
  for (const s of [-1, 1]) {
    panels.push(box(B.t, h, B.run, B.cx + s * B.halfW, LEVEL.quay + h / 2, B.cz0 + B.run / 2));
    const c = crenellation(B.run, { height: 0.9, thick: 0.55, pitch: 2.3 });
    c.rotateY(Math.PI / 2);
    c.translate(B.cx + s * B.halfW, B.top, B.cz0 + B.run / 2);
    caps.push(c);
    lights.push({ p: [B.cx + s * (B.halfW - 0.2), B.top + 1.1, B.cz0 + B.run * 0.5], color: '#ffc47e', halo: 1.0 });
  }
  panels.push(curtain(B.cx - B.halfW, B.cx + B.halfW, {
    y0: LEVEL.quay - 1.2, y1: B.top, z: z1, t: B.t,
    openings: [{ at: B.cx, width: B.gate.width, sill: LEVEL.quay + 0.1, spring }],
  }));
  caps.push(faceAt({
    x: B.cx, y: LEVEL.quay - 1.2, spring, radius: r, z: z1 + B.t / 2 + 0.06,
    ring: 0.4, depth: 0.3, count: 11,
  }));
  const front = crenellation(B.halfW * 2, { height: 0.9, thick: 0.55, pitch: 2.3 });
  front.translate(B.cx, B.top, z1);
  caps.push(front);

  // 门洞上的闸楼台：一座小台子加一间瓦屋，守望这一方瓮中
  const yu = B.top + 0.3;
  panels.push(box(B.gate.width + 6.4, 1.0, B.t + 1.8, B.cx, yu + 0.5, z1));
  const hutW = B.gate.width + 3.2, hutD = B.t + 0.8;
  panels.push(box(hutW, 2.6, hutD, B.cx, yu + 1.0 + 1.3, z1));
  wood.push(box(hutW * 0.62, 1.9, 0.2, B.cx, yu + 1.0 + 1.05, z1 + hutD / 2 + 0.05));
  const hutRoof = chineseRoof({ width: hutW, depth: hutD, height: 1.9, ridgeRatio: 0.5, overhang: 0.5, segU: 14, segV: 9 });
  hutRoof.translate(B.cx, yu + 1.0 + 2.6, z1);
  tiles.push(hutRoof);
  lights.push({ p: [B.cx, yu + 1.6, z1 + hutD / 2 + 0.4], color: '#ffcf92', halo: 1.3, column: 3 });

  const g = new THREE.Group();
  g.add(mesh(panels, M.brick), mesh(caps, M.brickWarm), mesh(tiles, M.roof), mesh(wood, M.beam));
  return { group: g, gate: [B.cx, LEVEL.quay + 3.0, z1], zFront: z1 };
}

/* ------------------------------------------------------------------ 主入口 */
export function buildWall(scene) {
  const group = new THREE.Group();
  group.name = 'panmen-gate';
  const acc = { brick: [], warm: [], stone: [], dark: [] };
  const caps = [];
  const lightSpots = [];

  /* 城垣三段：中间让给水门台座与陆门台座 */
  const segs = [
    [W.xFrom, WG.x - WG.width / 2],
    [WG.x + WG.width / 2, LG.x - LG.width / 2],
    [LG.x + LG.width / 2, W.xTo],
  ];
  for (const [x0, x1] of segs) {
    if (x1 - x0 < 2) continue;
    const len = x1 - x0, cx = (x0 + x1) / 2;
    acc.brick.push(curtain(x0, x1, { y0: W.base, y1: W.top, z: W.z, t: W.t }));
    // 陡水石脚与腰线檐石
    const pg = plinthGeo(len, 1.7, W.t, { proud: 0.42 });
    pg.translate(cx, W.base, W.z);
    acc.stone.push(pg);
    acc.warm.push(box(len + 0.5, 0.42, 0.6, cx, LEVEL.quay + 3.2, FACE_S + 0.12));
    // 顶面墁砖 + 外侧雉堞、内侧女墙
    acc.warm.push(box(len, 0.3, W.t - 0.5, cx, W.top + 0.15, W.z));
    const crest = crenellation(len, { height: W.crenelH, thick: 0.66, pitch: 2.4 });
    crest.translate(cx, W.top + 0.3, FACE_S - 0.5);
    caps.push(crest);
    const inner = parapet(len, { height: 0.96, thick: 0.5 });
    inner.translate(cx, W.top + 0.3, FACE_N + 0.5);
    caps.push(inner);
  }

  /* 马面：凸出墙面的一座座方台 */
  for (let x = W.xFrom + 40; x <= W.xTo - 40; x += W.bastion.every) {
    if (Math.abs(x - WG.x) < WG.width / 2 + 14 || Math.abs(x - LG.x) < LG.width / 2 + 14) continue;
    const b = W.bastion;
    const zc = FACE_S + b.proj / 2 - 0.5;
    acc.brick.push(curtain(x - b.width / 2, x + b.width / 2, {
      y0: W.base, y1: b.top, z: zc, t: W.t * 0.74,
    }));
    const c = crenellation(b.width + 1.2, { height: 0.88, thick: 0.6, pitch: 2.2 });
    c.translate(x, b.top + 0.24, zc);
    caps.push(c);
  }

  /* 水门：内外两重砖台，各以三重纵联拱券串成隧道，两重之间留 4.6m 的闸口天井 */
  const gateBlock = (zc, depth, arch) => {
    const r = arch.width / 2;
    acc.brick.push(curtain(WG.x - WG.width / 2, WG.x + WG.width / 2, {
      y0: WG.base, y1: WG.top, z: zc, t: depth,
      openings: [{ at: WG.x, width: arch.width, sill: arch.sill, spring: arch.spring }],
    }));
    acc.warm.push(faceAt({ x: WG.x, y: WG.base, spring: arch.spring, radius: r, z: zc + depth / 2 + 0.08 }));
    acc.warm.push(faceAt({ x: WG.x, y: WG.base, spring: arch.spring, radius: r, z: zc - depth / 2 - 0.08 }));
    // 隧道里还有一道道券：三重拱串联，洞才有一层层的进深
    for (let i = 1; i < WG.rings; i++) {
      acc.warm.push(faceAt({
        x: WG.x, y: WG.base, spring: arch.spring, radius: r - 0.22,
        z: zc + depth / 2 - (depth * i) / WG.rings, ring: 0.4, depth: 0.3, count: 15,
      }));
    }
    // 闸板槽与绞关石：水门旧可落闸蓄水，这两样在城上至今留有痕迹
    for (const s of [-1, 1]) {
      acc.dark.push(box(0.42, arch.spring - arch.sill + r * 0.5, 0.9,
        WG.x + s * (r - 0.24), (arch.sill + arch.spring + r * 0.25) / 2, zc));
      acc.stone.push(box(1.5, 0.72, 0.72, WG.x + s * (r + 1.2), arch.sill + 0.42, zc));
    }
    // 顶平台与一周垛口
    acc.warm.push(box(WG.width, 0.34, depth - 0.6, WG.x, WG.top + 0.17, zc));
    const c = crenellation(WG.width, { height: 1.15, thick: 0.72, pitch: 2.3 });
    c.translate(WG.x, WG.top + 0.34, zc + depth / 2 - 0.5);
    caps.push(c);
    const b = parapet(WG.width, { height: 0.92, thick: 0.52 });
    b.translate(WG.x, WG.top + 0.34, zc - depth / 2 + 0.5);
    caps.push(b);
    for (const s of [-1, 1]) {
      const e = crenellation(depth - 1.4, { height: 1.0, thick: 0.64, pitch: 2.2 });
      e.rotateY(Math.PI / 2);
      e.translate(WG.x + s * (WG.width / 2 - 0.4), WG.top + 0.34, zc);
      caps.push(e);
    }
    // 洞内两盏：把券面刷亮，从河上看就是一道暖拱
    lightSpots.push({ p: [WG.x, arch.sill + 1.3, zc], color: '#ffbe7c', halo: 1.5, column: 7 });
    lightSpots.push({ p: [WG.x, arch.spring + r - 1.4, zc], color: '#ffd09a', halo: 1.1, column: 4 });
  };
  gateBlock(GATE_Z.outer, WG.outer.depth, WG.outer.arch);
  gateBlock(GATE_Z.inner, WG.inner.depth, WG.inner.arch);
  {
    // 两重之间的夹墙与走道天井，闸口就落在这里
    const zMid = (GATE_Z.outer - WG.outer.depth / 2 + GATE_Z.inner + WG.inner.depth / 2) / 2;
    const ro = WG.outer.arch.width / 2;
    for (const s of [-1, 1]) {
      acc.brick.push(box(1.7, WG.top - WG.base, WG.gap + 0.6,
        WG.x + s * (ro + 2.4), (WG.base + WG.top) / 2, zMid));
      const walk = parapet(WG.gap + 1.2, { height: 0.9, thick: 0.5 });
      walk.rotateY(Math.PI / 2);
      walk.translate(WG.x + s * (WG.width / 2 - 0.4), WG.top + 0.3, zMid);
      caps.push(walk);
      acc.stone.push(box(3.4, 0.3, WG.gap + 0.6, WG.x + s * (ro + 5.4), LEVEL.quay + 0.2, zMid));
    }
  }
  // 水门前的八字石墙，把河面收到洞口那么宽
  for (const s of [-1, 1]) {
    const wing = box(10.5, 5.2, 1.6, 0, 0, 0);
    wing.rotateY(s * 0.6);
    wing.translate(WG.x + s * (WG.width / 2 + 3.4), LEVEL.quay + 1.1,
      GATE_Z.outer + WG.outer.depth / 2 - 1.6);
    acc.stone.push(wing);
  }

  /* 陆门：一门道三重拱的砖台，上面起城楼 */
  const lgz = W.z + 1.0;
  const lgDepth = LG.depth;
  acc.brick.push(curtain(LG.x - LG.width / 2, LG.x + LG.width / 2, {
    y0: LG.base, y1: LG.top, z: lgz, t: lgDepth, openings: [LG.arch],
  }));
  {
    const o = LG.arch, r = o.width / 2;
    acc.warm.push(faceAt({ x: LG.x, y: LG.base, spring: o.spring, radius: r, z: lgz + lgDepth / 2 + 0.08 }));
    acc.warm.push(faceAt({ x: LG.x, y: LG.base, spring: o.spring, radius: r, z: lgz - lgDepth / 2 - 0.08 }));
    // 门道里再两道券，与"三道纵联拱券串联"的记载对得上
    for (let i = 1; i < WG.rings; i++) {
      acc.warm.push(faceAt({
        x: LG.x, y: LG.base, spring: o.spring, radius: r - 0.16,
        z: lgz + lgDepth / 2 - (lgDepth * i) / WG.rings, ring: 0.36, depth: 0.28, count: 13,
      }));
    }
    acc.stone.push(box(o.width + 0.8, 0.24, 1.3, LG.x, o.sill + 0.12, lgz + lgDepth / 2 - 0.7));
    // 洞内一盏，照亮门洞与额石
    lightSpots.push({ p: [LG.x, o.spring + 0.4, lgz], color: '#ffcf92', halo: 1.4, column: 4 });
    const plate = carving('盤門', 3.6, 1.2, { dir: 'h' });
    plate.position.set(LG.x, LG.top - 1.6, lgz + lgDepth / 2 + 0.2);
    group.add(plate);
  }

  const tower = gateTower(lightSpots);
  tower.group.position.set(LG.x, 0, lgz);
  group.add(tower.group);
  registerOccluder(tower.group, 6.5, new THREE.Vector3(LG.x, LG.top + 3, lgz));

  /* 月城 */
  const barb = barbican(lightSpots);
  group.add(barb.group);

  /* 登城马道：城内一侧两条砖坡道 */
  for (const x of [-34, 84]) {
    const run = 30, rise = W.top - LEVEL.quay;
    const r = rampGeo({ run, rise, width: 5.2 });
    r.rotateY(-Math.PI / 2);
    r.translate(x, LEVEL.quay, FACE_N - run);
    acc.brick.push(r);
    for (const s of [-1, 1]) {
      const band = crenellation(run, { height: 0.86, thick: 0.5, pitch: 2.4 });
      band.rotateY(Math.PI / 2);
      band.translate(x + s * 2.9, LEVEL.quay, FACE_N - run / 2);
      caps.push(band);
    }
  }

  /* 垛口一线灯：从河上看，城头是一条断续的暖线 */
  for (let x = W.xFrom + 10; x <= W.xTo - 10; x += 7) {
    if (Math.abs(x - WG.x) < WG.width / 2 + 2 || Math.abs(x - LG.x) < LG.width / 2 + 2) continue;
    lightSpots.push({ p: [x, W.top + W.crenelH + 0.35, FACE_S - 0.5], color: '#ffc47e', halo: 1.15, size: 0.14 });
  }

  /* 组装 */
  group.add(mesh(acc.brick, M.brick));
  group.add(mesh(acc.warm, M.brickWarm));
  group.add(mesh(acc.stone, M.stoneDressed));
  group.add(mesh(acc.dark, M.ink));
  group.add(mesh(caps, M.brickWarm));
  addLamps(group, lightSpots);
  scene.add(group);
  return { group, lights: group.userData.lamps, tower, barbican: barb, gateZ: GATE_Z, lgz };
}

/** 灯头：一个小发光球 + 一圈晕，顺带记下水面上要拖出的光柱位置 */
function addLamps(group, spots) {
  const lamps = [];
  for (const s of spots) {
    const size = s.size || 0.15;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), glow(s.color || '#ffcf92', 1.5));
    bulb.position.set(...s.p);
    group.add(bulb);
    if (s.halo) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,204,138', 0.14), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      // 晕只留一小圈：加性圆斑被 bloom 一放大就糊成光饼
      sp.scale.setScalar(s.halo * 0.45);
      sp.position.set(...s.p);
      group.add(sp);
    }
    if (s.column) {
      lamps.push({ p: new THREE.Vector3(...s.p), color: s.color || '#ffcf92', width: s.column * 0.5, depth: s.column });
    }
  }
  group.userData.lamps = lamps;
  return lamps;
}
