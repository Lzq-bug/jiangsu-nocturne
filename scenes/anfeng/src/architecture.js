import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, PAL, lit, rand, rr, boxGeo, mesh, stripGeo, registerOccluder, chineseRoof } from './kit.js';
import { RIVER, TOWN, DIKE, WORKS, WEIR, BRIDGE, LANES } from './data.js';
import * as T from './textures.js';
import { housePlot, pailou, laneGate, stoneArchBridge, ghatSteps, stoneLamp, yardWall, lanternProp, quayFurniture } from './townkit.js';

const HW = RIVER.halfWidth;
const DECK = RIVER.deckY;

/** 镇的落地与街面都比河面高一点，泥地、石板、石岸三种面 */
M.ground = lit('#63614f', { map: T.dikeEarth(), rough: 1, side: THREE.DoubleSide });
M.ground.map = M.ground.map.clone();
M.ground.map.repeat.set(26, 60);
M.ground.map.needsUpdate = true;
M.quay = lit('#9aa1ad', { map: T.stone('#7c8290'), rough: 0.92 });
// 街面是一条 200 m 的带子，青石必须按带的长度重铺
M.flagStreet = lit('#8f97a6', { map: T.flagstone('#4f5661'), rough: 0.82 });
M.flagStreet.map.repeat.set(2.2, 62);
M.flagStreet.map.needsUpdate = true;

const placed = (grp, x, z, rotY = 0, ground = DECK) => {
  grp.position.set(x, ground, z);
  grp.rotation.y = rotY;
  return grp;
};
/** 已经知道自己 y 的小件直接用这个，别和 placed 混 */
const setP = (o, x, y, z) => { o.position.set(x, y, z); return o; };

/* ------------------------------------------------------------------ 地面与驳岸 */

function banks(scene) {
  const grp = new THREE.Group();
  grp.name = 'ground';

  // 西岸地面：从纤道一直铺到堤脚
  const west = new THREE.Mesh(new THREE.PlaneGeometry(150, 430, 1, 1), M.ground);
  west.rotation.x = -Math.PI / 2;
  west.position.set(-HW - 75, DECK, 0);
  west.receiveShadow = true;
  grp.add(west);

  // 东岸地面：码头—盐仓—灶区—草荡，一路降到海
  const east = new THREE.Mesh(new THREE.PlaneGeometry(110, 430, 1, 1), M.ground);
  east.rotation.x = -Math.PI / 2;
  east.position.set(HW + 55, DECK - 0.15, 0);
  east.receiveShadow = true;
  grp.add(east);

  // 两岸石驳岸：压在水面以下的裙墙 + 岸顶石
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(boxGeo(1.8, DECK + 2.6, 430, s * (HW + 0.9), DECK / 2 - 1.3, 0), M.quay);
    wall.receiveShadow = true; wall.castShadow = true;
    grp.add(wall);
    const cap = new THREE.Mesh(boxGeo(2.6, 0.28, 430, s * (HW + 1.2), DECK + 0.06, 0), M.stoneDressed);
    grp.add(cap);
  }

  // 纤道（西）与装卸道（东）：青石铺面
  const tow = new THREE.Mesh(boxGeo(5.4, 0.16, 400, -HW - 4.4, DECK + 0.1, 0), M.flag);
  tow.receiveShadow = true;
  const haul = new THREE.Mesh(boxGeo(6.2, 0.16, 300, HW + 4.2, DECK + 0.02, -10), M.flag);
  haul.receiveShadow = true;
  grp.add(tow, haul);
  return grp;
}

/* ------------------------------------------------------------------ 镇街 */

function townStreet() {
  const grp = new THREE.Group();
  // 主街：南北向，宽约八米
  const street = new THREE.Mesh(boxGeo(9, 0.2, TOWN.z1 - TOWN.z0, TOWN.mainStreetX, DECK + 0.14, (TOWN.z0 + TOWN.z1) / 2), M.flagStreet);
  street.receiveShadow = true;
  grp.add(street);
  // 与主街平行的河街（贴着纤道）
  const rstrip = new THREE.Mesh(boxGeo(4.2, 0.18, 190, TOWN.riverRowX + 6.4, DECK + 0.12, 6), M.flagStreet);
  rstrip.receiveShadow = true;
  grp.add(rstrip);

  // 横巷：把河街、主街与后街串起来
  const laneZ = [-52, -18, 24, 62, 96];
  laneZ.forEach((z, i) => {
    const lane = new THREE.Mesh(boxGeo(42, 0.16, 3.4, TOWN.laneX - 4, DECK + 0.11, z), M.flag);
    lane.receiveShadow = true;
    grp.add(lane);
    const gate = laneGate({ width: 4.6, height: 3.5, title: LANES[i % LANES.length] });
    grp.add(placed(gate, TOWN.laneX + 2.2, z, Math.PI / 2));
  });

  // 牌楼跨主街：柱子排在 Z 向，整组转 90°
  const pf = pailou({ span: 12.4, height: 7.6, title: '安丰', sub: '淮南中十场' });
  grp.add(placed(pf, TOWN.mainStreetX, 24, 0, DECK + 0.2));
  return { group: grp, laneZ };
}

/** 沿 X（街巷）方向看，屋顶都在两侧；face 决定开门朝哪条街 */
function houseRows(grp) {
  // skip：主街西侧让给鲍氏大楼、东岳宫、大悲庵三处，房子不再堵住门楼
  const SKIP = [[-36, -8], [78, 106], [-72, -44]];
  const rows = [
    { x: TOWN.riverRowX, face: 1, rot: Math.PI / 2, z0: -76, z1: 104, step: 7.6, w: 7.2, d: 6.4, storey: 0.18, signs: 0.5, skip: [] },
    { x: TOWN.westRowX, face: 1, rot: Math.PI / 2, z0: -66, z1: 96, step: 8.2, w: 7.8, d: 7.0, storey: 0.26, signs: 0.34, skip: SKIP },
    { x: TOWN.backX, face: -1, rot: -Math.PI / 2, z0: -58, z1: 72, step: 9.0, w: 8.4, d: 7.4, storey: 0.1, signs: 0.2, skip: SKIP },
  ];
  const SIGN = ['盐行', '米行', '布行', '茶馆', '酒垆', '南货', '柴行', '鱼行'];
  const lamps = [];
  for (const r of rows) {
    let z = r.z0;
    let k = 0;
    while (z <= r.z1) {
      // 巷口留空
      const atLane = [-52, -18, 24, 62, 96].some((lz) => Math.abs(lz - z) < 4.4);
      const atSkip = r.skip.some(([a, b]) => z > a && z < b);
      if (!atLane && !atSkip) {
        const storeys = rand() < r.storey ? 2 : 1;
        const h = housePlot({
          w: r.w * rr(0.86, 1.1), d: r.d * rr(0.88, 1.12), storeys, face: r.face,
          sign: rand() < r.signs ? SIGN[(k++) % SIGN.length] : '',
          lanterns: storeys === 2 ? 3 : 2,
        });
        grp.add(placed(h, r.x, z, r.rot));
      }
      z += r.step * rr(0.86, 1.12);
    }
  }

  // 廊棚：河街上一段遮雨的檐廊，苏北河镇常见
  for (let z = -46; z <= 58; z += 6) {
    const posts = [];
    posts.push(boxGeo(0.16, 2.9, 0.16, 0, 1.45, -2.9));
    posts.push(boxGeo(0.16, 2.9, 0.16, 0, 1.45, 2.9));
    posts.push(boxGeo(0.2, 0.2, 6.2, 0, 2.86, 0));
    grp.add(placed(mesh(posts, M.beam), TOWN.riverRowX + 8.6, z, 0, DECK + 0.2));
    const roof = new THREE.Mesh(
      chineseLeanTo(),
      rand() > 0.5 ? M.roofDark : M.roof,
    );
    roof.position.set(TOWN.riverRowX + 8.9, DECK + 3.0, z);
    roof.rotation.set(0, Math.PI / 2, -0.16);
    grp.add(roof);
    lamps.push(new THREE.Vector3(TOWN.riverRowX + 8.6, DECK + 2.4, z));
    grp.add(setP(lanternProp(0, 0, 0, { r: 0.22 }), TOWN.riverRowX + 8.6, DECK + 2.3, z));
  }
  return lamps;
}

function chineseLeanTo() {
  if (!chineseLeanTo._g) {
    const g = new THREE.PlaneGeometry(6.2, 3.4);
    chineseLeanTo._g = g;
  }
  return chineseLeanTo._g;
}

/* ------------------------------------------------------------------ 宅院三处 */

/** 鲍氏大楼：临街门楼 + 前后两进 + 院墙（轮廓写意，不指认间架） */
function baoMansion(grp) {
  const x = -50, z = -22;
  const gate = new THREE.Group();
  const piers = [];
  piers.push(boxGeo(1.5, 5.2, 1.2, -1.7, 2.6, 0));
  piers.push(boxGeo(1.5, 5.2, 1.2, 1.7, 2.6, 0));
  piers.push(boxGeo(4.6, 0.6, 1.4, 0, 5.4, 0));
  const roof = new THREE.Mesh(liteRoofGeo({ width: 5.6, depth: 1.8, height: 0.9 }), M.roof);
  roof.position.y = 5.8;
  gate.add(mesh(piers, M.brick), roof);
  const plate = plaqueLite('鲍氏大楼', 3.0, 0.9);
  plate.position.set(0, 4.5, 0.75);
  gate.add(plate);
  for (const s of [-1, 1]) gate.add(setP(lanternProp(0, 0, 0, { r: 0.24 }), s * 2.2, 4.0, s * 0.9));
  grp.add(placed(gate, x, z, Math.PI / 2, DECK));
  registerOccluder(gate, 3.4, new THREE.Vector3(x, DECK + 3, z));

  // 院墙围出一个前后两进的院子：门楼在东，正屋在西
  for (const [dx, dz, len, rot] of [[-1, 0, 22, Math.PI / 2], [1, 0, 22, Math.PI / 2], [0, -1, 15, 0], [0, 1, 15, 0]]) {
    const w = yardWall(len, { height: 3.0 });
    grp.add(placed(w, x - 9 + dx * 11, z + dz * 7.4, rot, DECK));
  }
  const hall = housePlot({ w: 10.4, d: 6.8, face: 1, storeys: 2, lanterns: 4, upperLight: 0.75 });
  grp.add(placed(hall, x - 13.5, z, Math.PI / 2, DECK));
  const wing = housePlot({ w: 7.4, d: 5.2, face: -1, lanterns: 2 });
  grp.add(placed(wing, x - 4.6, z + 4.4, -Math.PI / 2, DECK));
  // 天井里的一盏地灯与一道影壁
  grp.add(setP(lanternProp(0, 0, 0, { r: 0.2 }), x, DECK + 1.2, z + 2.2));
  const screen = new THREE.Mesh(boxGeo(0.5, 3.2, 5.6), M.brickDark);
  grp.add(setP(screen, x - 2.6, DECK + 1.6, z));
  return new THREE.Vector3(x, DECK + 6.4, z);
}

/** 东岳宫：山门 + 仅存的大殿 + 月台与庭灯 */
function eastPeakHall(grp, anchorsHall) {
  const x = -50, z = 92;
  const hall = housePlot({ w: 12.5, d: 9.2, face: 1, lanterns: 4, brick: true });
  const hg = placed(hall, x - 9, z, Math.PI / 2, DECK + 0.5);
  hg.children.forEach((c) => { c.receiveShadow = true; });
  grp.add(hg);

  // 月台与踏道
  const terrace = new THREE.Mesh(boxGeo(15, 0.55, 14, 0, 0.27, 0), M.stoneDressed);
  grp.add(placed(terrace, x - 8.6, z, 0, DECK));
  for (let i = 0; i < 4; i++) {
    grp.add(setP(new THREE.Mesh(boxGeo(5.4, 0.16, 0.7), M.stone), x - 1.2, DECK + 0.42 - i * 0.16, z + i * 0.6));
  }

  const gate = new THREE.Group();
  const parts = [];
  parts.push(boxGeo(1.2, 4.4, 1.0, -2.6, 2.2, 0));
  parts.push(boxGeo(1.2, 4.4, 1.0, 2.6, 2.2, 0));
  parts.push(boxGeo(6.6, 0.5, 1.2, 0, 4.6, 0));
  gate.add(mesh(parts, M.brick));
  const roof = new THREE.Mesh(liteRoofGeo({ width: 7.4, depth: 2.0, height: 1.0 }), M.roofDark);
  roof.position.y = 4.9;
  gate.add(roof);
  const plate = plaqueLite('东岳宫', 2.4, 0.8, { bg: '#2a2016' });
  plate.position.set(0, 3.7, 0.66);
  gate.add(plate);
  grp.add(placed(gate, x, z, Math.PI / 2, DECK));

  // 庭前两株老柏（用柳的骨架改作剪影）与一排长明灯
  for (const s of [-1, 1]) {
    const lamp = stoneLamp({ height: 2.8, color: PAL.lampGlow });
    grp.add(setP(lamp.group, x - 2.4, DECK, z + s * 3.6));
    anchorsHall.push(new THREE.Vector3(x - 2.4, DECK + 2.5, z + s * 3.6));
  }
  return new THREE.Vector3(x, DECK + 7.2, z);
}

/** 大悲庵：一间门屋 + 郑板桥联 */
function beiAn(grp) {
  const x = -50, z = -58;
  const gate = new THREE.Group();
  const parts = [];
  parts.push(boxGeo(1.1, 3.4, 0.9, -1.5, 1.7, 0));
  parts.push(boxGeo(1.1, 3.4, 0.9, 1.5, 1.7, 0));
  parts.push(boxGeo(4.2, 0.4, 1.0, 0, 3.5, 0));
  gate.add(mesh(parts, M.wall));
  const roof = new THREE.Mesh(liteRoofGeo({ width: 5.0, depth: 1.6, height: 0.8 }), M.roofDark);
  roof.position.y = 3.75;
  gate.add(roof);

  // 一联：右出句、左对句，竖写
  const right = coupletBoard('白菜青盐粯子饭', -1.5, 1.9);
  const left = coupletBoard('瓦壶天水菊花茶', 1.5, 1.9);
  gate.add(right, left);
  const small = plaqueLite('大悲庵', 1.9, 0.66);
  small.position.set(0, 2.95, 0.55);
  gate.add(small);
  grp.add(placed(gate, x, z, Math.PI / 2, DECK));

  const court = housePlot({ w: 7.4, d: 6.0, face: 1, lanterns: 2 });
  grp.add(placed(court, x - 7.4, z, Math.PI / 2, DECK));
  for (const [dx, dz, len, rot] of [[0, -1, 12, 0], [0, 1, 12, 0], [-1, 0, 12, Math.PI / 2]]) {
    grp.add(placed(yardWall(len, { height: 2.5 }), x - 4 + dx * 6, z + dz * 5.6, rot, DECK));
  }
  grp.add(setP(lanternProp(0, 0, 0, { r: 0.24, color: '#ffd9a6' }), x - 2.4, DECK + 3.0, z));
  return new THREE.Vector3(x, DECK + 4.2, z);
}

function coupletBoard(text, x, y) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 2.4),
    new THREE.MeshBasicMaterial({ map: T.plaque(text, { dir: 'v', bg: '#2b1c14', fg: '#e9d6ae', border: '#8c6b3c' }), toneMapped: false }),
  );
  m.position.set(x, y, 0.6);
  return m;
}

/* ------------------------------------------------------------------ 东岸码头与盐仓 */

function eastWharf(grp) {
  for (const z of [-52, -38, -14, 20]) {
    const g = ghatSteps({ z, ground: DECK - 0.15, width: 3.6, side: 1 });
    grp.add(g.group);
    grp.userData.berthMarks = grp.userData.berthMarks || [];
    grp.userData.berthMarks.push(g.foot);
    grp.add(setP(quayFurniture(0, 0, 0), HW + 6.2, DECK - 0.15, z + 2.4));
    const lamp = stoneLamp({ height: 2.6 });
    grp.add(setP(lamp.group, HW + 6.4, DECK - 0.15, z - 2.2));
    grp.userData.lamps = grp.userData.lamps || [];
    grp.userData.lamps.push(new THREE.Vector3(HW + 6.4, DECK + 2.3, z - 2.2));
  }

  // 盐仓：一面敞开的长棚，里头是码好的盐坨
  const { x, z } = WORKS.warehouse;
  const walls = [];
  walls.push(boxGeo(15, 3.6, 0.5, 0, 1.8, -5));
  walls.push(boxGeo(15, 3.6, 0.5, 0, 1.8, 5));
  walls.push(boxGeo(0.5, 3.6, 10.4, -7.4, 1.8, 0));
  walls.push(boxGeo(15, 0.4, 11.4, 0, 3.8, 0));
  const shed = mesh(walls, M.brickDark);
  shed.castShadow = true; shed.receiveShadow = true;
  grp.add(placed(shed, x, DECK - 0.1, z));
  const roof = new THREE.Mesh(liteRoofGeo({ width: 16, depth: 12, height: 1.7 }), M.roofDark);
  roof.position.set(x, DECK + 3.9, z);
  grp.add(roof);
  // 敞口内的盐坨与一盏仓灯
  for (let i = 0; i < 5; i++) {
    const heap = new THREE.Mesh(saltHeapGeo(), M.salt);
    heap.position.set(x - 4.4 + i * 2.2, DECK - 0.05, z + rr(-2.6, 2.6));
    heap.scale.setScalar(rr(0.7, 1.15));
    heap.castShadow = true;
    grp.add(heap);
  }
  grp.add(setP(lanternProp(0, 0, 0, { r: 0.3, color: '#ffe2b0' }), x + 6.6, DECK + 3.0, z));
  return new THREE.Vector3(x + 6.6, DECK + 2.8, z);
}

function saltHeapGeo() {
  if (!saltHeapGeo._g) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(1.25 * Math.cos(t * Math.PI * 0.5), 1.15 * Math.sin(t * Math.PI * 0.5)));
    }
    saltHeapGeo._g = new THREE.LatheGeometry(pts, 16);
  }
  return saltHeapGeo._g;
}

/* ------------------------------------------------------------------ 坝与桥 */

/** 河坝：低堰 + 三个闸墩 + 压水木杠，潮满时从堰顶漫过（形制写意） */
function tidalWeir(grp) {
  const g = new THREE.Group();
  const parts = [];
  const spanX = WEIR.width;
  parts.push(boxGeo(spanX, 0.5, 1.9, 0, WEIR.sillY - 0.25, 0));
  for (const s of [-1, 1]) parts.push(boxGeo(1.4, 2.0, 2.4, s * (spanX / 2 - 0.7), 1.0, 0));
  for (const dx of [-spanX / 6, 0, spanX / 6]) {
    parts.push(boxGeo(1.1, 1.7, 1.5, dx, 0.85, 0));
  }
  const body = mesh(parts, M.stoneDressed);
  body.castShadow = true;
  g.add(body);
  // 闸板与压杠：木杠挑着一盏坝灯
  const boards = [];
  for (const dx of [-spanX / 6 - 0.9, spanX / 6 + 0.9]) {
    boards.push(boxGeo(0.18, 1.3, 2.2, dx, 1.35, 0));
  }
  g.add(mesh(boards, M.woodDark));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, spanX * 0.72, 6), M.beam);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 2.3, 0);
  g.add(bar);
  const lamp = lanternProp(0, 0, 0, { r: 0.28, color: '#ffdfae' });
  lamp.position.set(0, 2.0, 0);
  g.add(lamp);
  const lamp2 = lanternProp(0, 0, 0, { r: 0.24 });
  lamp2.position.set(-spanX / 3, 1.7, 0);
  g.add(lamp2);
  g.position.set(0, 0, WEIR.z);
  grp.add(g);
  return { group: g, lampWorld: new THREE.Vector3(0, 2.0, WEIR.z) };
}

/** 跨河石桥：单孔高拱，以便盐船穿桥（形制写意，"南石桥"巷名可考） */
function riverBridge(grp) {
  const b = stoneArchBridge({ span: BRIDGE.span, rise: BRIDGE.rise, width: BRIDGE.width });
  b.group.position.set(0, DECK - 1.4, BRIDGE.z);
  grp.add(b.group);
  // 桥头两盏灯 + 一块写意的桥界石
  for (const s of [-1, 1]) {
    const lamp = stoneLamp({ height: 2.5 });
    grp.add(setP(lamp.group, s * (HW + 4.2), DECK, BRIDGE.z + 3.4));
    grp.userData.lamps = grp.userData.lamps || [];
    grp.userData.lamps.push(new THREE.Vector3(s * (HW + 4.2), DECK + 2.2, BRIDGE.z + 3.4));
  }
  return b.apex.clone().setY(b.apex.y + DECK - 1.4).setZ(BRIDGE.z);
}

/* ------------------------------------------------------------------ 长堤 */

function dikeCrossSection() {
  return [
    [DIKE.xLand - 26, -0.2],
    [DIKE.xLand, 0.9],
    [DIKE.xCrestW, DIKE.crestY - 0.2],
    [DIKE.xCrestE, DIKE.crestY],
    [DIKE.xSea, 0.8],
    [DIKE.xSea + 14, -0.1],
  ];
}

/**
 * 捍海堰（范公堤）。土身用夯土贴图，海侧（东）坡面抛石护脚，
 * 堤顶走道铺石、隔一段一盏巡堤灯。堤上无碑无柳的可考实物，皆补写。
 */
function buildEmbankment(grp) {
  const len = RIVER.z1 - RIVER.z0 + 40;
  const body = new THREE.Mesh(
    stripGeo({ section: dikeCrossSection(), length: len, z0: RIVER.z0 - 20, wobble: 0.5 }),
    M.earth,
  );
  body.receiveShadow = true;
  body.castShadow = true;
  grp.add(body);

  // 堤顶石道
  const path = new THREE.Mesh(
    stripGeo({
      section: [[DIKE.xCrestW + 0.4, DIKE.crestY + 0.06], [DIKE.xCrestE - 0.4, DIKE.crestY + 0.1]],
      length: len, z0: RIVER.z0 - 20,
    }),
    M.flag,
  );
  path.receiveShadow = true;
  grp.add(path);

  // 海侧抛石护脚：一列乱石沿坡脚排开
  const rockGeo = new THREE.IcosahedronGeometry(1.15, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, M.rock, 260);
  const d = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const t = rand();
    const z = RIVER.z0 + t * (RIVER.z1 - RIVER.z0);
    const x = DIKE.xSea + rr(-3.5, 6.5);
    const s = rr(0.55, 1.5);
    d.position.set(x, DIKE.crestY * (1 - (x - DIKE.xSea) / 22) * rr(0.06, 0.3), z);
    d.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    d.scale.set(s, s * rr(0.55, 0.95), s * rr(0.8, 1.3));
    d.updateMatrix();
    rocks.setMatrixAt(i, d.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.frustumCulled = false;
  grp.add(rocks);

  // 三处上下堤的石级
  for (const z of [-46, 40, 108]) {
    const steps = [];
    for (let k = 0; k < 12; k++) {
      const t = k / 11;
      steps.push(boxGeo(2.6, 0.28, 1.0, DIKE.xSea + 2 - t * 14, 0.15 + t * DIKE.crestY, 0));
    }
    grp.add(setP(mesh(steps, M.stone), 0, 0, z));
  }

  // 巡堤灯：堤顶每隔一段一盏，夜里把长堤勾出一条线
  const lamps = [];
  for (let z = -140; z <= 150; z += 24) {
    const lamp = stoneLamp({ height: 2.4, color: '#ffca8a' });
    grp.add(setP(lamp.group, (DIKE.xCrestW + DIKE.xCrestE) / 2, DIKE.crestY - 0.05, z));
    lamps.push(new THREE.Vector3((DIKE.xCrestW + DIKE.xCrestE) / 2, DIKE.crestY + 2.1, z));
  }
  return lamps;
}

/* ------------------------------------------------------------------ 小件复用 */

/** 门楼、棚顶用的薄命屋顶：只取轮廓，不斗栱不起翘 */
function liteRoofGeo({ width, depth, height }) {
  const g = chineseRoof({ width, depth, height, ridgeRatio: 0.52, curve: 0.45, eaveLift: 0.42, overhang: 0.3, hip: true });
  g.translate(0, height * 0.5, 0);
  return g;
}

function plaqueLite(text, w, h, opts = {}) {
  const grp = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: T.plaque(text, { dir: 'h', ...opts }), toneMapped: false }),
  );
  const frame = new THREE.Mesh(boxGeo(w * 1.08, h * 1.18, 0.1, 0, 0, -0.06), M.gilt);
  grp.add(frame, plate);
  plate.position.z = 0.03;
  return grp;
}

/* ------------------------------------------------------------------ 总装 */

export function buildTown(scene) {
  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);

  const anchors = { lamps: [], berthMarks: [], dikeLamps: [], ovens: [], reedFields: [] };

  // 岸与地单独成组：倒影只收建筑，不收大地面
  const ground = banks(scene);
  scene.add(ground);
  const street = townStreet();
  group.add(street.group);
  anchors.lamps.push(...houseRows(group));
  anchors.lamps.push(new THREE.Vector3(-HW - 4.6, DECK + 2.6, 40));

  // 三处实物宅院
  anchors.lamps.push(baoMansion(group), eastPeakHall(group, anchors.lamps), beiAn(group));
  // 河埠沿线的石灯
  for (const z of [-64, -30, 4, 40, 74, 104]) {
    const g = ghatSteps({ z, side: -1, ground: DECK, width: 3.4 });
    group.add(g.group);
    const lamp = stoneLamp({ height: 2.4 });
    group.add(placed(lamp.group, -HW - 9.4, DECK, z + 2.0, DECK));
    anchors.lamps.push(new THREE.Vector3(-HW - 9.4, DECK + 2.1, z + 2.0));
  }

  // 东岸码头与盐仓、坝、桥
  anchors.lamps.push(eastWharf(group));
  anchors.weir = tidalWeir(group).lampWorld;
  anchors.bridge = riverBridge(group);

  // 长堤
  anchors.dikeLamps = buildEmbankment(group);

  // 镇内的零星小物：石缸、门槛、柴堆
  const propsGeo = [];
  for (let i = 0; i < 40; i++) {
    const x = rr(TOWN.backX - 6, TOWN.riverRowX + 8);
    const z = rr(TOWN.z0, TOWN.z1);
    propsGeo.push(boxGeo(rr(0.4, 1.1), rr(0.3, 0.8), rr(0.4, 1.1), x, rr(0.2, 0.5), z));
  }
  group.add(mesh(propsGeo, M.stoneDark));

  return { group, ground, anchors, lanes: street.laneZ };
}
