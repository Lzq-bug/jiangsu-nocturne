/**
 * 塔院与四至：围墙·山门·甬道·碑（今整治后格局，形制写意），西广福寺、
 * 北泰山寺剪影（方位可考），东西溪盐仓灶区（盐仓可考、廒房卤池写意），
 * 河北岸一线老街（临河设肆为常理推定，商号幌子径行写意）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chineseRoof, ridgeOrnament, pillarGeo, railingGeo, plaqueMesh, lit, box } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, RIVER, YARD } from './data.js';

const WALLS = { x0: -42, x1: 22, z0: -26, z1: 12 };

function mats() {
  const plaster = lit('#b9ae96', { map: TX.plaster('#a89c82'), rough: 0.95, emissive: '#100e0a', ei: 0.22 });
  const dark = lit('#8f96a4', { map: TX.stone('#7c8290'), rough: 0.92 });
  const tile = lit('#b9c2d4', { map: TX.roofTiles('#2f384a', '#465168', '#6d7b95'), rough: 0.8, side: THREE.DoubleSide, emissive: '#10151f', ei: 0.4 });
  const wood = lit('#6f4530', { map: TX.wood('#5a3524', '#33190f'), rough: 0.82 });
  const ink = lit('#22252f', { rough: 0.85 });
  const salt = lit('#a7a89e', { rough: 0.8, emissive: '#191a16', ei: 0.5 });
  const brine = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0b1a22'), roughness: 0.12, metalness: 0.2 });
  const glowWin = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbe72').multiplyScalar(0.85) });
  glowWin.toneMapped = false;
  const shopDoor = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79b').multiplyScalar(0.5) });
  shopDoor.toneMapped = false;
  return { plaster, dark, tile, wood, ink, salt, brine, glowWin, shopDoor };
}

/** 一段墙：墙身 + 墙帽 + 瓦面 */
function wallRun(len, M, at, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 2.1, 0.5), M.plaster);
  body.position.y = 1.05;
  body.castShadow = body.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.2, 0.78), M.dark);
  cap.position.y = 2.2;
  const tiles = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.94), M.tile);
  tiles.position.y = 2.34;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.2), M.dark);
  ridge.position.y = 2.44;
  g.add(body, cap, tiles, ridge);
  g.position.set(at[0], GROUND_Y, at[1]);
  g.rotation.y = rotY;
  return g;
}

/** 一座殿：台基、柱、身、屋顶、脊饰，参数化到够写意即可 */
function hall(M, { w, d, wallH = 3.4, roofH = 3.2, bays = 5, plinth = 0.8, name = null, facing = 'E' }) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 1.8, plinth, d + 1.8), M.dark);
  p.position.y = plinth / 2;
  p.receiveShadow = true;
  g.add(p);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), M.plaster);
  wall.position.y = plinth + wallH / 2;
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);

  const roof = new THREE.Mesh(
    chineseRoof({ width: w + 2.4, depth: d + 1.6, height: roofH, ridgeRatio: 0.5, eaveLift: 0.55 }),
    M.tile,
  );
  roof.position.y = plinth + wallH + 0.1;
  roof.castShadow = true;
  g.add(roof);
  const ridgeGeo = ridgeOrnament({ width: w + 2.4, depth: d + 1.6, height: roofH, ridgeRatio: 0.5 });
  const ridge = new THREE.Mesh(ridgeGeo, M.ink);
  ridge.position.y = plinth + wallH + 0.1;
  g.add(ridge);

  // 檐柱一圈
  const pillars = new THREE.InstancedMesh(pillarGeo(wallH, 0.22), M.wood, (bays + 1) * 2 + 2);
  const dm = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (w * i) / bays;
    for (const z of [-d / 2 - 0.25, d / 2 + 0.25]) {
      dm.position.set(x, plinth, z);
      dm.updateMatrix();
      pillars.setMatrixAt(n++, dm.matrix);
    }
  }
  pillars.instanceMatrix.needsUpdate = true;
  pillars.count = n;
  g.add(pillars);

  // 门窗：正面一排暖光格
  const winGeo = new THREE.PlaneGeometry(w / bays * 0.46, 1.5);
  const wins = new THREE.InstancedMesh(winGeo, M.glowWin, bays);
  for (let i = 0; i < bays; i++) {
    dm.position.set(-w / 2 + w * (i + 0.5) / bays, plinth + 1.5, d / 2 + 0.06);
    dm.rotation.set(0, 0, 0);
    dm.scale.set(1, 1, 1);
    dm.updateMatrix();
    wins.setMatrixAt(i, dm.matrix);
  }
  wins.instanceMatrix.needsUpdate = true;
  g.add(wins);

  const rail = new THREE.Mesh(railingGeo(w + 1.6, { height: 0.95, spacing: 1.5 }), M.dark);
  rail.position.set(0, plinth, d / 2 + 0.9);
  g.add(rail);
  for (const s of [-1, 1]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, plinth, 0.9), M.dark);
    step.position.set(s * (w / 2 + 0.6), plinth / 2, d / 2 + 1.1);
    g.add(step);
  }
  if (name) {
    const pl = plaqueMesh(name, 2.0, 0.66, { bg: '#132a4a' });
    pl.position.set(0, plinth + wallH - 0.5, d / 2 + 0.12);
    g.add(pl);
  }
  // 面朝东：把正面（局部 +Z）转到世界 +X
  if (facing === 'E') g.rotation.y = Math.PI / 2;
  if (facing === 'S') g.rotation.y = 0;
  if (facing === 'N') g.rotation.y = Math.PI;
  if (facing === 'W') g.rotation.y = -Math.PI / 2;
  return g;
}

/** 廒房：盐仓的长条硬山屋 */
function granary(M, w, d, h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(
    chineseRoof({ width: w + 1.2, depth: d + 1.2, height: h * 0.42, ridgeRatio: 0.94, eaveLift: 0.28, hip: false }),
    M.tile,
  );
  roof.position.y = h;
  roof.castShadow = true;
  g.add(body, roof);
  // 前后墙上的透气小窗
  for (let i = 0; i < 3; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), M.glowWin);
    win.position.set(-w / 3 + (i * w) / 3, h * 0.66, d / 2 + 0.03);
    g.add(win);
  }
  return g;
}

/** 河埠头：三级石阶下水 */
function steps(M, x) {
  const g = new THREE.Group();
  const n = RIVER.at - RIVER.halfWidth - 1.2;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 0.9), M.dark);
    s.position.set(x, GROUND_Y - 0.3 - i * 0.36, n + 0.5 + i * 0.9);
    s.receiveShadow = true;
    g.add(s);
  }
  const pair = [];
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), M.wood);
    post.position.set(x + s * 1.5, GROUND_Y - 0.4, n + 1.6);
    g.add(post);
    pair.push([x + s * 1.5, GROUND_Y - 0.4, n + 1.6]);
  }
  return { group: g, moorings: pair };
}

export function buildQuarter(scene) {
  const M = mats();
  const group = new THREE.Group();
  group.name = 'quarter';
  scene.add(group);
  const anchors = { lampPosts: [], shopLamps: [], doorGlows: [], stoves: [], windows: [] };

  /* ------------------------------------------------------------ 院墙与山门 */
  group.add(wallRun(WALLS.x1 - WALLS.x0, M, [(WALLS.x0 + WALLS.x1) / 2, WALLS.z0]));
  group.add(wallRun(WALLS.z1 - WALLS.z0, M, [WALLS.x0, (WALLS.z0 + WALLS.z1) / 2], Math.PI / 2));
  group.add(wallRun(WALLS.z1 - WALLS.z0, M, [WALLS.x1, (WALLS.z0 + WALLS.z1) / 2], Math.PI / 2));
  // 南面开门洞：偏西，山门不挡在塔的正前方
  const GAP = { x: -16, w: 7.8 };
  const left = GAP.x - GAP.w / 2 - WALLS.x0;
  const right = WALLS.x1 - (GAP.x + GAP.w / 2);
  group.add(wallRun(left, M, [WALLS.x0 + left / 2, WALLS.z1]));
  group.add(wallRun(right, M, [WALLS.x1 - right / 2, WALLS.z1]));

  const gate = new THREE.Group();
  gate.position.set(GAP.x, GROUND_Y, WALLS.z1);
  for (const s of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.6, 1.5), M.plaster);
    pier.position.set(s * 2.4, 1.8, 0);
    pier.castShadow = true;
    gate.add(pier);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.9), M.dark);
    cap.position.set(s * 2.4, 3.7, 0);
    gate.add(cap);
  }
  const gateRoof = new THREE.Mesh(
    chineseRoof({ width: 7.4, depth: 2.6, height: 1.7, ridgeRatio: 0.42, eaveLift: 0.6 }),
    M.tile,
  );
  gateRoof.position.y = 3.85;
  gateRoof.castShadow = true;
  const gateRidge = new THREE.Mesh(ridgeOrnament({ width: 7.4, depth: 2.6, height: 1.7, ridgeRatio: 0.42 }), M.ink);
  gateRidge.position.y = 3.85;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 1.2), M.wood);
  lintel.position.y = 3.5;
  const gatePlaque = plaqueMesh('海春轩塔', 2.9, 0.8, { bg: '#132a4a' });
  gatePlaque.position.set(0, 3.05, 0.78);
  gate.add(gateRoof, gateRidge, lintel, gatePlaque);
  for (const s of [-1, 1]) {
    anchors.doorGlows.push([GAP.x + s * 2.4, GROUND_Y + 2.9, WALLS.z1 + 0.5]);
    anchors.lampPosts.push([GAP.x + s * 3.8, WALLS.z1 + 1.4]);
  }
  group.add(gate);

  /* ------------------------------------------------------------ 甬道与碑 */
  const path = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.5), M.dark);
    slab.position.set(GAP.x, GROUND_Y + 0.05, WALLS.z1 - 1.6 - i * 1.7);
    slab.receiveShadow = true;
    path.add(slab);
  }
  // 到塔前折向东，止于塔身西侧（塔门在西北，门前小埕另铺）
  for (let i = 0; i < 6; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 3.2), M.dark);
    slab.position.set(GAP.x + 1.4 + i * 1.3, GROUND_Y + 0.05, -2.2);
    slab.receiveShadow = true;
    path.add(slab);
  }
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.2, 8), M.dark);
  plaza.geometry.rotateX(-Math.PI / 2);
  plaza.position.set(-4.6, GROUND_Y + 0.04, -3.4);
  plaza.receiveShadow = true;
  path.add(plaza);
  group.add(path);
  for (const z of [7.6, 2.4]) {
    for (const s of [-1, 1]) anchors.lampPosts.push([GAP.x + s * 2.2, z]);
  }

  const stele = new THREE.Group();
  stele.position.set(GAP.x + 3.2, GROUND_Y, 9.2);
  stele.rotation.y = -0.5;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.2), M.dark);
  base.position.y = 0.2;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.1, 0.3), lit('#c2c8d2', { map: TX.stone('#9aa2ae'), rough: 0.9 }));
  shaft.position.y = 1.3;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.5), M.dark);
  top.position.y = 2.5;
  const face = plaqueMesh('海春轩塔', 0.62, 1.7, { dir: 'v', bg: '#1b1f28', fg: '#f0e2c4', border: '#6c7482' });
  face.position.set(0, 1.34, 0.17);
  stele.add(base, shaft, top, face);
  group.add(stele);

  /* ------------------------------------------------------------ 广福寺（塔西） */
  const temple = hall(M, { w: 13, d: 9, wallH: 3.8, roofH: 3.6, bays: 5, plinth: 0.85, name: '大雄宝殿', facing: 'E' });
  temple.position.set(YARD.temple.x, GROUND_Y, YARD.temple.z);
  group.add(temple);
  anchors.lampPosts.push([YARD.temple.x + 8.4, YARD.temple.z + 6.4], [YARD.temple.x + 8.4, YARD.temple.z - 6.4]);
  const drum = new THREE.Mesh(mergeGeometries([
    box(0.9, 1.1, 0.9, -1.4, 0.55, 0), box(0.9, 1.1, 0.9, 1.4, 0.55, 0),
    box(3.4, 0.3, 1.3, 0, 1.25, 0), box(0.7, 0.8, 0.7, 0, 1.8, 0),
  ]), M.wood);
  drum.position.set(YARD.temple.x + 7.6, GROUND_Y, YARD.temple.z + 8.6);
  group.add(drum);

  /* ------------------------------------------------------------ 泰山寺（塔北，剪影） */
  const north = hall(M, { w: 11, d: 8, wallH: 3.4, roofH: 3, bays: 3, plinth: 1.1, facing: 'S' });
  north.position.set(YARD.northTemple.x, GROUND_Y + 0.4, YARD.northTemple.z);
  north.traverse((o) => { if (o.isMesh && o.material === M.glowWin) o.material = M.ink; });
  group.add(north);

  /* ------------------------------------------------------------ 西溪盐仓（塔东） */
  const salt = new THREE.Group();
  const gs = [[30, -8, 13, 5.4, 2.6], [30, 2, 13, 5.4, 2.6], [30, 11, 11, 5, 2.5]];
  for (const [x, z, w, d, h] of gs) {
    const g2 = granary(M, w, d, h);
    g2.position.set(x, GROUND_Y, z);
    g2.rotation.y = Math.PI / 2;
    salt.add(g2);
  }
  // 卤池：浅坑里一汪深色卤水
  for (let i = 0; i < 4; i++) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 4.2), M.brine);
    pan.position.set(38 + (i % 2) * 7, GROUND_Y + 0.06, -6 + Math.floor(i / 2) * 6.4);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.42, 4.7), M.dark);
    curb.position.set(pan.position.x, GROUND_Y - 0.06, pan.position.z);
    salt.add(curb, pan);
  }
  // 灶房：低棚 + 灶口火光
  for (let i = 0; i < 3; i++) {
    const shed = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.9, 3.2), M.ink);
    body.position.y = 0.95;
    const roof = new THREE.Mesh(
      chineseRoof({ width: 5.2, depth: 4.2, height: 1.1, ridgeRatio: 0.8, eaveLift: 0.3, hip: false }),
      M.tile,
    );
    roof.position.y = 1.9;
    shed.add(body, roof);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), M.shopDoor);
    mouth.position.set(0, 0.55, 1.66);
    shed.add(mouth);
    shed.position.set(46, GROUND_Y, -9 + i * 7.4);
    shed.rotation.y = -Math.PI / 2;
    salt.add(shed);
    anchors.stoves.push([44.6, GROUND_Y + 0.7, -9 + i * 7.4]);
  }
  // 盐堆：矮墩墩的一层薄盐，远了看着像土埠
  for (let i = 0; i < 5; i++) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1.5, 9, 5), M.salt);
    mound.scale.set(1.05, 0.3, 0.8);
    mound.position.set(33 + rr2(i), GROUND_Y + 0.2, 15.5 - (i % 3) * 3.2);
    salt.add(mound);
  }
  group.add(salt);

  /* ------------------------------------------------------------ 河北岸老街 */
  const street = new THREE.Group();
  // 只留两端设肆，中间空出一段河滩，塔才不被铺面挡死
  const fronts = [-25, -19.5, 15, 20.5, 26];
  fronts.forEach((x, i) => {
    const shop = new THREE.Group();
    const w = 4.4, d = 4.6, h = 2.7;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.plaster);
    body.position.y = h / 2;
    body.castShadow = true;
    const roof = new THREE.Mesh(
      chineseRoof({ width: w + 1.5, depth: d + 1.3, height: 1.4, ridgeRatio: 0.55, eaveLift: 0.5, hip: false }),
      M.tile,
    );
    roof.position.y = h;
    roof.castShadow = true;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.25), M.shopDoor);
    board.position.set(-0.5, 0.95, d / 2 + 0.04);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.72, 0.5), M.wood);
    counter.position.set(0.7, 0.36, d / 2 + 0.3);
    shop.add(body, roof, board, counter);
    const sign = plaqueMesh(SIGN[i % SIGN.length], 0.5, 1.5, { dir: 'v', bg: '#3a1c14', fg: '#f5e3bd', border: '#8a5a2c' });
    sign.position.set(w / 2 - 0.5, h - 0.5, d / 2 + 0.14);
    shop.add(sign);
    // 檐前挂灯的横杆位置交给 props
    anchors.shopLamps.push([x - 0.5, GROUND_Y + 2.2, YARD.street.z + d / 2 + 0.5]);
    shop.position.set(x, GROUND_Y, YARD.street.z);
    street.add(shop);
  });
  group.add(street);

  /* ------------------------------------------------------------ 河埠头 */
  const st = steps(M, 4);
  group.add(st.group);
  anchors.moorings = st.moorings;

  return { group, anchors, M };
}

const SIGN = ['盐', '茶', '布', '酒', '油', '米', '灯'];
const rr2 = (i) => ((i * 37) % 5) - 2;
