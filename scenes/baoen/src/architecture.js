/**
 * 寺之格局：中轴（山门—香水河桥—天王殿—大殿—琉璃塔—观音殿—法堂）、院墙四至、
 * 门外长街、聚宝山窑场、远景城墙与聚宝门。
 *
 * 可考的只有中轴次序、塔在大殿之后、寺中不列东西二塔，以及窑在聚宝山（今窑岗村）。
 * 各殿的开间、进深、台基、屋顶形式、院墙周长、三门形制、街市铺面——一律无存样可据，
 * 按常例推定，解说里统一称写意。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chineseRoof, ridgeOrnament, pillarGeo, railingGeo, plaqueMesh, lit, box, rr, rand } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, ARCH, RIVER, PIT, POOL, STATIONS } from './data.js';
import * as T from './textures.js';

function mats() {
  const plaster = lit('#a89f8c', { map: TX.plaster('#948873'), rough: 0.95, emissive: '#191510', ei: 0.4 });
  const stone = lit('#9aa0ac', { map: TX.stone('#7c8290'), rough: 0.92 });
  const tile = lit('#9fb4b0', { map: TX.roofTiles('#2c4038', '#436056', '#7fa093'), rough: 0.62, metal: 0.08, side: THREE.DoubleSide, emissive: '#111a18', ei: 0.42 });
  const wood = lit('#6f4530', { map: TX.wood('#5a3524', '#33190f'), rough: 0.82 });
  const ink = lit('#22252f', { rough: 0.85 });
  const glowWin = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbe72').multiplyScalar(0.9), toneMapped: false });
  const shopDoor = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8b073').multiplyScalar(0.34), toneMapped: false });
  const kilnBrick = lit('#8a6f56', { map: T.songBrick(), rough: 0.96, emissive: '#1a1008', ei: 0.4 });
  const rawBrick = lit('#9b8f76', { rough: 0.98 });
  const glazePool = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d2a26'), roughness: 0.14, metalness: 0.25 });
  return { plaster, stone, tile, wood, ink, glowWin, shopDoor, kilnBrick, rawBrick, glazePool };
}

/** 一段院墙：墙身 + 墙帽 + 瓦面 */
function wallRun(len, M, at, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 0.6), M.plaster);
  body.position.y = 1.25;
  body.castShadow = body.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.22, 0.9), M.stone);
  cap.position.y = 2.6;
  const tiles = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 1.1), M.tile);
  tiles.position.y = 2.76;
  g.add(body, cap, tiles);
  g.position.set(at[0], GROUND_Y, at[1]);
  g.rotation.y = rotY;
  return g;
}

/** 廊庑：一列柱 + 单坡披檐，沿院墙走（形制写意） */
function cloister(M, len) {
  const g = new THREE.Group();
  const n = Math.max(4, Math.round(len / 3.4));
  const cols = new THREE.InstancedMesh(pillarGeo(2.7, 0.2), M.wood, n + 1);
  const dm = new THREE.Object3D();
  for (let i = 0; i <= n; i++) {
    dm.position.set(-len / 2 + (len * i) / n, 0, 0);
    dm.rotation.set(0, 0, 0);
    dm.scale.set(1, 1, 1);
    dm.updateMatrix();
    cols.setMatrixAt(i, dm.matrix);
  }
  cols.instanceMatrix.needsUpdate = true;
  cols.castShadow = true;
  g.add(cols);
  const sill = new THREE.Mesh(box(len, 0.5, 0.5, 0, 0.25, 0), M.stone);
  const eave = new THREE.Mesh(box(len + 1.0, 0.26, 3.4, 0, 3.16, 0.5), M.tile);
  eave.rotation.x = -0.19;
  const beam = new THREE.Mesh(box(len + 0.6, 0.3, 0.36, 0, 2.92, -1.16), M.wood);
  const back = new THREE.Mesh(box(len, 1.1, 0.34, 0, 0.8, -1.3), M.plaster);
  g.add(sill, eave, beam, back);
  return g;
}

/** 一座殿：台基、墙身、柱、屋顶、脊饰、正面暖光窗 */
function hall(M, { w, d, wallH = 4.2, roofH = 3.8, bays = 5, plinth = 1.0, name = null, facing = 'S', dim = false }) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 2.6, plinth, d + 2.6), M.stone);
  p.position.y = plinth / 2;
  p.receiveShadow = true;
  g.add(p);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), M.plaster);
  wall.position.y = plinth + wallH / 2;
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);
  const roof = new THREE.Mesh(
    chineseRoof({ width: w + 3.2, depth: d + 2.2, height: roofH, ridgeRatio: 0.46, eaveLift: 0.6 }),
    M.tile,
  );
  roof.position.y = plinth + wallH + 0.12;
  roof.castShadow = true;
  g.add(roof);
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: w + 3.2, depth: d + 2.2, height: roofH, ridgeRatio: 0.46 }),
    M.ink,
  );
  ridge.position.y = plinth + wallH + 0.12;
  g.add(ridge);

  const pillars = new THREE.InstancedMesh(pillarGeo(wallH, 0.26), M.wood, (bays + 1) * 2 + 2);
  const dm = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (w * i) / bays;
    for (const z of [-d / 2 - 0.35, d / 2 + 0.35]) {
      dm.position.set(x, plinth, z);
      dm.rotation.set(0, 0, 0);
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      pillars.setMatrixAt(n++, dm.matrix);
    }
  }
  pillars.count = n;
  pillars.instanceMatrix.needsUpdate = true;
  g.add(pillars);

  const winGeo = new THREE.PlaneGeometry((w / bays) * 0.5, wallH * 0.44);
  const wins = new THREE.InstancedMesh(winGeo, dim ? M.ink : M.glowWin, bays);
  for (let i = 0; i < bays; i++) {
    dm.position.set(-w / 2 + w * (i + 0.5) / bays, plinth + wallH * 0.5, d / 2 + 0.08);
    dm.rotation.set(0, 0, 0);
    dm.scale.set(1, 1, 1);
    dm.updateMatrix();
    wins.setMatrixAt(i, dm.matrix);
  }
  wins.instanceMatrix.needsUpdate = true;
  g.add(wins);

  // 月台栏杆与两侧踏道
  const rail = new THREE.Mesh(railingGeo(w + 2.2, { height: 0.95, spacing: 1.6 }), M.stone);
  rail.position.set(0, plinth, d / 2 + 1.5);
  g.add(rail);
  for (const s of [-1, 1]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.0, plinth, 1.2), M.stone);
    step.position.set(s * (w / 2 + 1.0), plinth / 2, d / 2 + 1.6);
    g.add(step);
  }
  if (name) {
    const pl = plaqueMesh(name, 2.6, 0.8, { bg: '#132a4a' });
    pl.position.set(0, plinth + wallH - 0.7, d / 2 + 0.16);
    g.add(pl);
  }
  if (facing === 'N') g.rotation.y = Math.PI;
  if (facing === 'E') g.rotation.y = Math.PI / 2;
  if (facing === 'W') g.rotation.y = -Math.PI / 2;
  return g;
}

/** 三券一道式的山门 */
function gate(M, anchors) {
  const g = new THREE.Group();
  const w = 15, d = 4.2, wallH = 4.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), M.plaster);
  body.position.y = wallH / 2 + 0.6;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.6, d + 1.4), M.stone);
  plinth.position.y = 0.3;
  g.add(plinth);
  // 三券门：中券高，两侧券低
  const archMat = new THREE.MeshBasicMaterial({ color: 0x0b0c14, fog: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8e').multiplyScalar(0.55), toneMapped: false, fog: false });
  for (const [i, s] of [-1, 0, 1].entries()) {
    const cw = s === 0 ? 3.2 : 2.2, ch = s === 0 ? 4.0 : 3.0;
    const shape = new THREE.Shape();
    const r = cw / 2;
    shape.moveTo(-r, 0); shape.lineTo(-r, ch - r);
    shape.absarc(0, ch - r, r, Math.PI, 0, true);
    shape.lineTo(r, 0); shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), archMat);
    m.position.set(s * 4.9, 0.62, d / 2 + 0.05);
    g.add(m);
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(shape), glowMat);
    inner.scale.set(0.7, 0.7, 1);
    inner.position.set(s * 4.9, 0.62 + ch * 0.05, d / 2 - 0.4);
    g.add(inner);
    void i;
    anchors.doorGlows.push([s * 4.9, 2.0, ARCH.gate + d / 2]);
  }
  const roof = new THREE.Mesh(
    chineseRoof({ width: w + 2.4, depth: d + 1.8, height: 2.6, ridgeRatio: 0.5, eaveLift: 0.62 }),
    M.tile,
  );
  roof.position.y = wallH + 0.6;
  roof.castShadow = true;
  g.add(roof);
  const gateRidge = new THREE.Mesh(
    ridgeOrnament({ width: w + 2.4, depth: d + 1.8, height: 2.6, ridgeRatio: 0.5 }),
    M.ink,
  );
  gateRidge.position.y = wallH + 0.6;
  g.add(gateRidge);
  const pl = plaqueMesh('大报恩寺', 3.4, 1.0, { bg: '#101f38' });
  pl.position.set(0, wallH - 0.5, d / 2 + 0.2);
  g.add(pl);
  return g;
}

/** 香水河上的石桥：单孔平桥加栏板（形制写意） */
function bridge(M, anchors) {
  const g = new THREE.Group();
  const span = RIVER.halfWidth * 2 + 5, width = 7.2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.42, span), M.stone);
  deck.position.y = 1.35;
  deck.receiveShadow = true;
  g.add(deck);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railingGeo(span - 0.6, { height: 0.85, spacing: 1.3 }), M.stone);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(s * (width / 2 - 0.4), 1.56, 0);
    g.add(rail);
  }
  // 桥洞下的券与两坡蹬
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, width, 12, 1, true, 0, Math.PI), M.stone);
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 0.5;
  g.add(arch);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, 0.7), M.stone);
      st.position.set(0, 1.2 - i * 0.35, s * (span / 2 + 0.4 + i * 0.7));
      g.add(st);
    }
    anchors.lampPosts.push([-width / 2 - 0.6, RIVER.at + s * (span / 2 + 1.2)]);
    anchors.lampPosts.push([width / 2 + 0.6, RIVER.at + s * (span / 2 + 1.2)]);
  }
  return g;
}

/** 琉璃窑：馒头窑 + 火门 + 烟囱；窑形按北方馒头窑常例推定（写意） */
function kilns(M, anchors) {
  const g = new THREE.Group();
  const { x0, x1, z0, z1 } = ARCH.kiln;
  const rows = 2, cols = 3;
  for (let i = 0; i < rows * cols; i++) {
    const cx = x0 + ((i % cols) + 0.5) * ((x1 - x0) / cols);
    const cz = z0 + (Math.floor(i / cols) + 0.5) * ((z1 - z0) / rows);
    const body = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(2.3, 2.6, 1.3, 12).translate(0, 0.65, 0),
      new THREE.SphereGeometry(2.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.3, 0),
    ]), M.kilnBrick);
    body.castShadow = body.receiveShadow = true;
    body.position.set(cx, GROUND_Y, cz);
    g.add(body);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.85), new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff7a32').multiplyScalar(1.9), toneMapped: false, fog: false,
    }));
    mouth.position.set(cx, GROUND_Y + 0.55, cz + 2.62);
    g.add(mouth);
    anchors.kilnMouths.push([cx, GROUND_Y + 0.55, cz + 2.66]);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.4, 8), M.kilnBrick);
    stack.position.set(cx - 2.0, GROUND_Y + 3.4, cz - 1.6);
    stack.castShadow = true;
    g.add(stack);
  }
  // 坯垛：码好的素胎砖，一垛一垛像砌了一半的矮墙
  for (let i = 0; i < 14; i++) {
    const x = x0 + rr(2, x1 - x0 - 4), z = z0 + rr(1, z1 - z0 - 3);
    if (!STATIONS.every((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) > 7)) continue;
    const stack = new THREE.Mesh(mergeGeometries([
      box(2.4, 0.16, 1.6, 0, 0.08, 0), box(2.2, 0.16, 1.5, 0.06, 0.26, 0),
      box(2.4, 0.16, 1.6, -0.04, 0.44, 0.02), box(2.0, 0.16, 1.4, 0.02, 0.62, 0),
    ]), M.rawBrick);
    stack.position.set(x, GROUND_Y, z);
    stack.rotation.y = rand() * 0.6 - 0.3;
    stack.castShadow = true;
    g.add(stack);
  }
  // 釉缸与釉池：黄绿赭三色釉浆
  for (let i = 0; i < 5; i++) {
    const x = x1 - 6 - (i % 3) * 4.2, z = z1 - 3 - Math.floor(i / 3) * 3.6;
    const pan = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 2.2), M.glazePool);
    pan.position.set(x, GROUND_Y + 0.12, z);
    const curb = new THREE.Mesh(box(3.4, 0.5, 2.6, x, GROUND_Y - 0.1, z), M.stone);
    g.add(curb, pan);
  }
  // 凉棚：窑匠歇脚与堆料之处
  for (let i = 0; i < 3; i++) {
    const shed = new THREE.Group();
    const body = new THREE.Mesh(box(5.6, 2.2, 3.8, 0, 1.1, 0), M.ink);
    const roof = new THREE.Mesh(
      chineseRoof({ width: 6.6, depth: 4.8, height: 1.2, ridgeRatio: 0.86, eaveLift: 0.3, hip: false }),
      M.tile,
    );
    roof.position.y = 2.2;
    shed.add(body, roof);
    shed.position.set(x0 + 4 + i * 7.6, GROUND_Y, z1 + 5.4);
    shed.rotation.y = Math.PI;
    g.add(shed);
  }
  return g;
}

/** 门外长街：临街铺面 + 幌子 + 檐前灯位 */
function street(M, anchors) {
  const g = new THREE.Group();
  const { x0, x1, z } = ARCH.street;
  const signNames = ['琉璃', '窑', '香', '烛', '茶', '酒', '米', '油', '灯', '瓷'];
  let idx = 0;
  for (let x = x0; x < x1; x += 6.2) {
    if (Math.abs(x) < 5 && idx % 2 === 0) { idx++; continue; }   // 留出桥正对的街口
    const w = 4.6, d = 4.8, h = 2.9;
    const shop = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
    body.position.y = h / 2;
    body.castShadow = true;
    const roof = new THREE.Mesh(
      chineseRoof({ width: w + 1.5, depth: d + 1.3, height: 1.5, ridgeRatio: 0.55, eaveLift: 0.5, hip: false }),
      M.tile,
    );
    roof.position.y = h;
    roof.castShadow = true;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.15), M.shopDoor);
    board.position.set(-0.6, 0.9, d / 2 + 0.05);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 0.55), M.wood);
    counter.position.set(0.8, 0.38, d / 2 + 0.34);
    shop.add(body, roof, board, counter);
    const sign = plaqueMesh(signNames[idx % signNames.length], 0.52, 1.6, { dir: 'v', bg: '#3a1c14', fg: '#f5e3bd', border: '#8a5a2c' });
    sign.position.set(w / 2 - 0.55, h - 0.5, d / 2 + 0.16);
    shop.add(sign);
    shop.position.set(x + rr(-0.6, 0.6), GROUND_Y, z + rr(-0.7, 0.7));
    shop.rotation.y = rr(-0.05, 0.05);
    g.add(shop);
    anchors.shopLamps.push([x - 0.6, GROUND_Y + 2.4, z + d / 2 + 0.6]);
    idx++;
  }
  return g;
}

/** 远景城墙与聚宝门：城在寺北，实距约一公里，画面压缩（写意） */
function farWall(M) {
  const g = new THREE.Group();
  const len = 460, h = ARCH.wall.h;
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, 3.2), lit('#6e7178', { map: TX.stone('#5a5d64'), rough: 0.95 }));
  body.position.set(0, h / 2 - 1.2, ARCH.wall.z);
  g.add(body);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 5.2), lit('#5b5f68', { rough: 0.95 }));
  walk.position.set(0, h - 1.4, ARCH.wall.z);
  g.add(walk);
  // 垛口
  const merlon = new THREE.InstancedMesh(box(1.0, 1.1, 0.5), lit('#63666e', { rough: 0.95 }), Math.floor(len / 3.2));
  const dm = new THREE.Object3D();
  let n = 0;
  for (let x = -len / 2; x < len / 2; x += 3.2) {
    dm.position.set(x, h - 0.6, ARCH.wall.z + 1.4);
    dm.rotation.set(0, 0, 0);
    dm.scale.set(1, 1, 1);
    dm.updateMatrix();
    merlon.setMatrixAt(n++, dm.matrix);
  }
  merlon.count = n;
  merlon.instanceMatrix.needsUpdate = true;
  g.add(merlon);
  // 城楼剪影（门在城之西偏北，位置示意）
  const tower = hall(M, { w: 12, d: 7, wallH: 4.6, roofH: 3.4, bays: 3, plinth: 2.4, facing: 'S', dim: true });
  tower.position.set(-62, h - 2.2, ARCH.wall.z - 1.0);
  g.add(tower);
  return g;
}

/** 聚宝山：低丘剪影，只在西南铺一道暗脊（南京有山，与滨海平原诸景不同） */
function hills() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x080c16, fog: true });
  mat.toneMapped = false;
  for (const [x, z, sx, sz, h] of [[-190, 150, 120, 70, 26], [-250, 96, 150, 80, 34], [-150, 210, 90, 60, 20]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.scale.set(sx, h, sz);
    m.position.set(x, -2, z);
    g.add(m);
  }
  return g;
}

export function buildQuarter(scene) {
  const M = mats();
  const group = new THREE.Group();
  group.name = 'quarter';
  scene.add(group);
  const anchors = { lampPosts: [], shopLamps: [], doorGlows: [], kilnMouths: [], moorings: [] };

  /* ------------------------------------------------------------ 院墙四至（南面开门） */
  const { eastWall, westWall, northWall, southWall } = ARCH;
  group.add(wallRun(eastWall - westWall, M, [0, northWall]));
  group.add(wallRun(southWall - northWall, M, [westWall, (northWall + southWall) / 2], Math.PI / 2));
  group.add(wallRun(southWall - northWall, M, [eastWall, (northWall + southWall) / 2], Math.PI / 2));
  // 南墙在中轴两侧留洞，中轴上是山门前的照壁而非门洞——门开在东西两侧（写意做法）
  const gateW = 17;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? gateW / 2 : -gateW / 2 - (eastWall - gateW / 2);
    const x1 = s > 0 ? eastWall : -gateW / 2;
    group.add(wallRun(x1 - x0, M, [(x0 + x1) / 2, southWall]));
  }

  /* ------------------------------------------------------------ 中轴诸建筑 */
  const gt = gate(M, anchors);
  gt.position.set(0, GROUND_Y, ARCH.gate);
  group.add(gt);
  const br = bridge(M, anchors);
  br.position.set(0, 0, RIVER.at);
  group.add(br);
  const tw = hall(M, { w: ARCH.tianwang.w, d: ARCH.tianwang.d, wallH: 4.6, roofH: 3.6, bays: 5, plinth: 1.1, name: '天王殿' });
  tw.position.set(0, GROUND_Y, ARCH.tianwang.z);
  group.add(tw);
  const dd = hall(M, { w: ARCH.dadian.w, d: ARCH.dadian.d, wallH: 6.4, roofH: 5.4, bays: 7, plinth: 1.6, name: '大殿' });
  dd.position.set(0, GROUND_Y, ARCH.dadian.z);
  group.add(dd);
  const gy = hall(M, { w: ARCH.guanyin.w, d: ARCH.guanyin.d, wallH: 4.6, roofH: 3.6, bays: 5, plinth: 1.1, name: '观音殿', facing: 'N' });
  gy.position.set(0, GROUND_Y, ARCH.guanyin.z);
  group.add(gy);
  const ft = hall(M, { w: ARCH.fatang.w, d: ARCH.fatang.d, wallH: 4.2, roofH: 3.2, bays: 3, plinth: 1.0, name: '法堂', facing: 'N' });
  ft.position.set(0, GROUND_Y, ARCH.fatang.z);
  group.add(ft);
  const sj = hall(M, { w: 11, d: 8, wallH: 4.4, roofH: 3.4, bays: 3, plinth: 1.0, name: '藏经殿', facing: 'E' });
  sj.position.set(ARCH.sutra.x, GROUND_Y, ARCH.sutra.z);
  group.add(sj);

  /* ------------------------------------------------------------ 两庑与钟鼓楼（形制写意） */
  for (const s of [-1, 1]) {
    const cl = cloister(M, 128);
    cl.position.set(s * 49, GROUND_Y, 14);
    cl.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(cl);
    for (let z = -40; z < 82; z += 13) anchors.lampPosts.push([s * 45.5, z]);
  }
  const bell = hall(M, { w: 6.4, d: 6.4, wallH: 3.6, roofH: 3.0, bays: 1, plinth: 0.9, name: '钟楼', facing: 'W' });
  bell.position.set(30, GROUND_Y, 62);
  group.add(bell);
  const drumTower = hall(M, { w: 6.4, d: 6.4, wallH: 3.6, roofH: 3.0, bays: 1, plinth: 0.9, name: '鼓楼', facing: 'E' });
  drumTower.position.set(-30, GROUND_Y, 62);
  group.add(drumTower);

  /* ------------------------------------------------------------ 甬道：桥—山门—天王殿—大殿—塔门 */
  const paveMat = lit('#8b8878', { map: T.paving(), rough: 0.96, emissive: '#0d0f12', ei: 0.3 });
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(9, ARCH.gate - ARCH.dadian.z + 8), paveMat);
  pave.geometry.rotateX(-Math.PI / 2);
  pave.position.set(0, GROUND_Y + 0.03, (ARCH.gate + ARCH.dadian.z) / 2);
  pave.receiveShadow = true;
  group.add(pave);
  // 塔前环道：绕台基一圈的条砖（避开探方与放生池）
  const ringPath = new THREE.Mesh(new THREE.RingGeometry(16.6, 20.2, 8, 1), paveMat);
  ringPath.geometry.rotateX(-Math.PI / 2);
  ringPath.position.set(0, GROUND_Y + 0.03, 0);
  ringPath.receiveShadow = true;
  group.add(ringPath);
  for (const [x, z] of [[4.6, 92], [-4.6, 92], [4.6, 66], [-4.6, 66], [4.6, 52], [-4.6, 52], [10.5, 24], [-10.5, 24]]) {
    anchors.lampPosts.push([x, z]);
  }

  /* ------------------------------------------------------------ 放生池的岸与石 */
  const curb = new THREE.Mesh(mergeGeometries([
    box(POOL.x1 - POOL.x0 + 1.6, 0.5, 0.8, (POOL.x0 + POOL.x1) / 2, GROUND_Y - 0.1, POOL.z0 - 0.4),
    box(POOL.x1 - POOL.x0 + 1.6, 0.5, 0.8, (POOL.x0 + POOL.x1) / 2, GROUND_Y - 0.1, POOL.z1 + 0.4),
    box(0.8, 0.5, POOL.z1 - POOL.z0 + 1.6, POOL.x0 - 0.4, GROUND_Y - 0.1, (POOL.z0 + POOL.z1) / 2),
    box(0.8, 0.5, POOL.z1 - POOL.z0 + 1.6, POOL.x1 + 0.4, GROUND_Y - 0.1, (POOL.z0 + POOL.z1) / 2),
  ]), M.stone);
  curb.receiveShadow = true;
  group.add(curb);
  anchors.lampPosts.push([POOL.x0 - 1.6, POOL.z1 + 1.2], [POOL.x1 + 1.6, POOL.z0 - 1.2]);

  /* ------------------------------------------------------------ 探方四周的护栏基座 */
  group.add(street(M, anchors));
  group.add(kilns(M, anchors));
  group.add(farWall(M));
  group.add(hills());

  return { group, anchors, M };
}
