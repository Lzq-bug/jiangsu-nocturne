/**
 * 园内配景：红梅阁（唐代始建、光绪二十六年重建的形制按一处园志）、
 * 文笔楼 / 梦笔轩 / 墨香榭 / 塔影山房 / 碑廊（1988 年"文笔夕照"景区名目可考，
 * 位置与形制一律写意）、园南入口门坊与砚池上的单孔石桥（今制，写意）。
 * 塔本身在 tower.js，这里只围合园林，把机位之间的视线留出来。
 */
import * as THREE from 'three';
import { chineseRoof, ridgeOrnament, pillarGeo, railingGeo, plaqueMesh, lit } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, PARK } from './data.js';

function mats() {
  const plaster = lit('#b6ab94', { map: TX.plaster('#a4987e'), rough: 0.95, emissive: '#100e0a', ei: 0.22 });
  const dark = lit('#949aa8', { map: TX.stone('#7c8290'), rough: 0.92 });
  const tile = lit('#b7c0d2', {
    map: TX.roofTiles('#2f384a', '#465168', '#6d7b95'), rough: 0.8,
    side: THREE.DoubleSide, emissive: '#10151f', ei: 0.42,
  });
  const wood = lit('#6f4530', { map: TX.wood('#5a3524', '#33190f'), rough: 0.82 });
  const ink = lit('#22252f', { rough: 0.85 });
  const glowWin = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbe72').multiplyScalar(0.4) });
  glowWin.toneMapped = false;
  const lanternDoor = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79b').multiplyScalar(0.45) });
  lanternDoor.toneMapped = false;
  return { plaster, dark, tile, wood, ink, glowWin, lanternDoor };
}

/** 台基 + 柱圈 + 屋面 + 脊饰 + 正面暖光格，够写意即可 */
function hall(M, {
  w, d, wallH = 3.6, roofH = 3.0, bays = 5, plinth = 0.8, name = null,
  facing = 'S', doubleEave = false, stories = 1,
}) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(w + 2.2, plinth, d + 2.2), M.dark);
  p.position.y = plinth / 2;
  p.receiveShadow = true;
  g.add(p);

  const storyH = wallH / stories;
  for (let s = 0; s < stories; s++) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, storyH, d), M.plaster);
    wall.position.y = plinth + storyH * (s + 0.5);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    // 每层正面一排暖光格
    const winGeo = new THREE.PlaneGeometry((w / bays) * 0.44, storyH * 0.5);
    const wins = new THREE.InstancedMesh(winGeo, M.glowWin, bays);
    const dm = new THREE.Object3D();
    for (let i = 0; i < bays; i++) {
      dm.position.set(-w / 2 + (w * (i + 0.5)) / bays, plinth + storyH * (s + 0.52), d / 2 + 0.06);
      dm.rotation.set(0, 0, 0);
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      wins.setMatrixAt(i, dm.matrix);
    }
    wins.instanceMatrix.needsUpdate = true;
    g.add(wins);
    // 平座栏杆（第二层挑出的那圈，夜里只读轮廓）
    if (s > 0 || doubleEave) {
      const rail = new THREE.Mesh(railingGeo(w * 0.98, { height: 0.8, spacing: 1.4 }), M.dark);
      rail.position.set(0, plinth + storyH * s, d / 2 + 0.75);
      g.add(rail);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(railingGeo(d * 0.9, { height: 0.8, spacing: 1.4 }), M.dark);
        side.position.set(sx * (w / 2 + 0.7), plinth + storyH * s, 0);
        side.rotation.y = Math.PI / 2;
        g.add(side);
      }
    }
    // 腰檐：上下层之间那一圈
    if (s > 0) {
      const band = new THREE.Mesh(
        chineseRoof({ width: w + 3.0, depth: d + 2.4, height: 1.25, ridgeRatio: 0.62, eaveLift: 0.5 }),
        M.tile,
      );
      band.position.y = plinth + storyH * s - 0.1;
      band.castShadow = true;
      g.add(band);
    }
  }

  const roofH2 = roofH * (doubleEave ? 1.15 : 1);
  const roof = new THREE.Mesh(
    chineseRoof({ width: w + 3.2, depth: d + 2.4, height: roofH2, ridgeRatio: 0.5, eaveLift: 0.6 }),
    M.tile,
  );
  roof.position.y = plinth + wallH + 0.12;
  roof.castShadow = true;
  g.add(roof);
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: w + 3.2, depth: d + 2.4, height: roofH2, ridgeRatio: 0.5 }),
    M.ink,
  );
  ridge.position.y = plinth + wallH + 0.12;
  g.add(ridge);

  // 檐柱一圈
  const pillars = new THREE.InstancedMesh(pillarGeo(wallH, 0.22), M.wood, (bays + 1) * 2 + 2);
  const dm = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + (w * i) / bays;
    for (const z of [-d / 2 - 0.3, d / 2 + 0.3]) {
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

  if (name) {
    const pl = plaqueMesh(name, 2.1, 0.7, { bg: '#132a4a' });
    pl.position.set(0, plinth + wallH - 0.62, d / 2 + 0.16);
    g.add(pl);
  }
  for (const s of [-1, 1]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.0, plinth, 1.0), M.dark);
    step.position.set(s * (w / 2 + 0.8), plinth / 2, d / 2 + 1.3);
    g.add(step);
  }
  if (facing === 'E') g.rotation.y = Math.PI / 2;
  if (facing === 'W') g.rotation.y = -Math.PI / 2;
  if (facing === 'N') g.rotation.y = Math.PI;
  if (facing === 'S') g.rotation.y = 0;
  return g;
}

/**
 * 临水榭台：一半探在池上、屋顶只盖靠岸那一间。
 * 机位必须站在探出水面的那一段上——48 米高的塔，塔顶倒影就落在脚边两三米，
 * 站在岸上看是拍不到塔影的（第一版站在东岸，水面只拍到一片黑）。
 * side=E：陆地在 +X 一侧（砚池东榭）；side=W：陆地在 −X 一侧（塔影池西榭）。
 */
function waterPavilion(M, { x, z, name = null, side = 'E' }) {
  const g = new THREE.Group();
  const s = side === 'E' ? -1 : 1;           // 水面方向
  const deckW = 20, deckD = 17;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.22, deckD), M.wood);
  deck.position.y = GROUND_Y + 0.16;
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  // 水面那一半底下四根石柱，落到池底
  for (const fx of [0.2, 0.44]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 2.4, 8), M.dark);
      p.position.set(s * fx * deckW, GROUND_Y - 1.0, sz * (deckD / 2 - 1.8));
      p.castShadow = true;
      g.add(p);
    }
  }
  // 屋顶只盖靠岸那一间
  const hutW = 8.4, hutD = 12, wallH = 3.1;
  const hx = -s * (deckW / 2 - hutW / 2);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(hutW, wallH, hutD), M.plaster);
  hut.position.set(hx, GROUND_Y + wallH / 2 + 0.27, 0);
  hut.castShadow = hut.receiveShadow = true;
  g.add(hut);
  const roof = new THREE.Mesh(
    chineseRoof({ width: hutW + 2.6, depth: hutD + 2.0, height: 2.4, ridgeRatio: 0.44, eaveLift: 0.6 }),
    M.tile,
  );
  roof.position.set(hx, GROUND_Y + wallH + 0.4, 0);
  roof.castShadow = true;
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: hutW + 2.6, depth: hutD + 2.0, height: 2.4, ridgeRatio: 0.44 }),
    M.ink,
  );
  ridge.position.set(hx, GROUND_Y + wallH + 0.4, 0);
  g.add(roof, ridge);
  if (name) {
    const pl = plaqueMesh(name, 1.9, 0.62, { bg: '#132a4a' });
    pl.position.set(hx, GROUND_Y + wallH - 0.3, s * (hutD / 2 + 0.1));
    pl.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(pl);
  }
  // 栏板只围靠岸那一头与两侧：临水一头必须敞着，
  // 不然 0.9 米高的栏板正好挡住塔顶倒影入水的那十几度视角
  const endRail = new THREE.Mesh(railingGeo(deckD - 1.2, { height: 0.9, spacing: 1.3 }), M.dark);
  endRail.position.set(-s * (deckW / 2 - 0.35), GROUND_Y + 0.27, 0);
  endRail.rotation.y = Math.PI / 2;
  g.add(endRail);
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(railingGeo(5.4, { height: 0.9, spacing: 1.3 }), M.dark);
    rail.position.set(s * (deckW / 2 - 2.7), GROUND_Y + 0.27, sz * (deckD / 2 - 3.0));
    g.add(rail);
  }
  g.position.set(x, 0, z);
  return g;
}

/** 碑廊：柱 + 顶 + 一列空碑（碑文不拟，写意） */
function steleWalk(M, { x0, x1, z, bays = 8 }) {
  const g = new THREE.Group();
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 3.0), M.dark);
  body.position.set(cx, GROUND_Y + 0.1, z);
  body.receiveShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(
    chineseRoof({ width: len + 1.4, depth: 4.0, height: 1.5, ridgeRatio: 0.94, eaveLift: 0.4, hip: false }),
    M.tile,
  );
  roof.position.set(cx, GROUND_Y + 3.1, z);
  roof.castShadow = true;
  g.add(roof);
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: len + 1.4, depth: 4.0, height: 1.5, ridgeRatio: 0.94 }),
    M.ink,
  );
  ridge.position.set(cx, GROUND_Y + 3.1, z);
  g.add(ridge);
  const pillars = new THREE.InstancedMesh(pillarGeo(2.9, 0.17), M.wood, (bays + 1) * 2);
  const dm = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i <= bays; i++) {
    const x = x0 + (len * i) / bays;
    for (const dz of [-1.4, 1.4]) {
      dm.position.set(x, GROUND_Y + 0.2, z + dz);
      dm.rotation.set(0, 0, 0);
      dm.scale.set(1, 1, 1);
      dm.updateMatrix();
      pillars.setMatrixAt(n++, dm.matrix);
    }
  }
  pillars.count = n;
  pillars.instanceMatrix.needsUpdate = true;
  g.add(pillars);
  // 碑：贴北面一列，碑面朝廊内
  for (let i = 0; i < bays; i++) {
    const x = x0 + (len * (i + 0.5)) / bays;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.22), lit('#c0c6d0', { map: TX.stone('#9aa2ae'), rough: 0.9 }));
    shaft.position.set(x, GROUND_Y + 1.25, z - 1.1);
    shaft.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.4), M.dark);
    cap.position.set(x, GROUND_Y + 2.35, z - 1.1);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.7), M.dark);
    base.position.set(x, GROUND_Y + 0.36, z - 1.1);
    g.add(shaft, cap, base);
  }
  return g;
}

/** 园南入口门坊：两柱一额，额书景区名（今制，写意） */
function gate(M, { x, z, name }) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.2, 1.6), M.plaster);
    pier.position.set(s * 3.6, GROUND_Y + 2.1, 0);
    pier.castShadow = true;
    g.add(pier);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 2.0), M.dark);
    cap.position.set(s * 3.6, GROUND_Y + 4.3, 0);
    g.add(cap);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.6, 1.4), M.wood);
  lintel.position.set(0, GROUND_Y + 4.0, 0);
  lintel.castShadow = true;
  const roof = new THREE.Mesh(
    chineseRoof({ width: 9.6, depth: 2.4, height: 1.5, ridgeRatio: 0.4, eaveLift: 0.62 }),
    M.tile,
  );
  roof.position.set(0, GROUND_Y + 4.6, 0);
  roof.castShadow = true;
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: 9.6, depth: 2.4, height: 1.5, ridgeRatio: 0.4 }),
    M.ink,
  );
  ridge.position.set(0, GROUND_Y + 4.6, 0);
  const pl = plaqueMesh(name, 3.0, 0.86, { bg: '#123057' });
  pl.position.set(0, GROUND_Y + 3.4, 0.8);
  g.add(lintel, roof, ridge, pl);
  g.position.set(x, 0, z);
  return g;
}

/** 一段园墙（今景区范围，写意） */
function wallRun(M, len, at, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, 2.0, 0.45), M.plaster);
  body.position.y = 1.0;
  body.castShadow = body.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.2, 0.72), M.dark);
  cap.position.y = 2.1;
  const tiles = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.88), M.tile);
  tiles.position.y = 2.24;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.18), M.dark);
  ridge.position.y = 2.34;
  g.add(body, cap, tiles, ridge);
  g.position.set(at[0], GROUND_Y, at[1]);
  g.rotation.y = rotY;
  return g;
}

export function buildQuarter(scene) {
  const M = mats();
  const group = new THREE.Group();
  group.name = 'quarter';
  scene.add(group);
  const anchors = { lampPosts: [], shopLamps: [], doorGlows: [], eaves: [] };

  /* ------------------------------------------------------------ 红梅阁（塔西） */
  const hongmei = hall(M, {
    w: 14, d: 11, wallH: 10.4, roofH: 3.6, bays: 5, plinth: 1.3,
    name: '红梅阁', facing: 'S', stories: 2, doubleEave: true,
  });
  hongmei.position.set(PARK.hongmei.x, GROUND_Y, PARK.hongmei.z);
  group.add(hongmei);
  anchors.doorGlows.push([PARK.hongmei.x, GROUND_Y + 2.2, PARK.hongmei.z + 6.4]);
  anchors.lampPosts.push([PARK.hongmei.x - 9.6, PARK.hongmei.z + 8.6], [PARK.hongmei.x + 9.6, PARK.hongmei.z + 8.6]);

  /* ------------------------------------------------------------ 塔影山房（塔影池北） */
  const studio = hall(M, {
    w: 12, d: 6.6, wallH: 3.4, roofH: 2.6, bays: 4, plinth: 0.7,
    name: '塔影山房', facing: 'S',
  });
  studio.position.set(PARK.studio.x, GROUND_Y, PARK.studio.z);
  group.add(studio);
  anchors.lampPosts.push([PARK.studio.x - 8.4, PARK.studio.z + 5.2], [PARK.studio.x + 8.4, PARK.studio.z + 5.2]);

  /* ------------------------------------------------------------ 砚池三组建筑 */
  const lou = hall(M, {
    w: 13, d: 8, wallH: 7.4, roofH: 3.2, bays: 5, plinth: 1.1,
    name: '文笔楼', facing: 'N', stories: 2,
  });
  lou.position.set(PARK.wenbiLou.x, GROUND_Y, PARK.wenbiLou.z);
  group.add(lou);
  anchors.lampPosts.push([PARK.wenbiLou.x - 9, PARK.wenbiLou.z - 6.4], [PARK.wenbiLou.x + 9, PARK.wenbiLou.z - 6.4]);

  const mengbi = hall(M, {
    w: 9, d: 6, wallH: 3.4, roofH: 2.6, bays: 3, plinth: 0.8,
    name: '梦笔轩', facing: 'W',
  });
  mengbi.position.set(PARK.mengbi.x, GROUND_Y, PARK.mengbi.z);
  group.add(mengbi);

  /* ------------------------------------------------------------ 两座水榭：机位站在探出水面的平台上 */
  const pavE = waterPavilion(M, { x: PARK.pavilionE.x, z: PARK.pavilionE.z, name: '墨香榭', side: 'E' });
  group.add(pavE);
  const pavW = waterPavilion(M, { x: PARK.pavilionW.x, z: PARK.pavilionW.z, side: 'W' });
  group.add(pavW);
  anchors.doorGlows.push([PARK.pavilionE.x + 5.8, GROUND_Y + 2.4, PARK.pavilionE.z + 6.2]);
  anchors.doorGlows.push([PARK.pavilionW.x - 5.8, GROUND_Y + 2.4, PARK.pavilionW.z + 6.2]);
  anchors.lampPosts.push([PARK.pavilionE.x + 6.4, PARK.pavilionE.z - 9.6]);
  anchors.lampPosts.push([PARK.pavilionW.x - 6.4, PARK.pavilionW.z - 9.6]);

  /* ------------------------------------------------------------ 碑廊沿砚池北岸 */
  const walk = steleWalk(M, {
    x0: PARK.steleWalk.x0, x1: PARK.steleWalk.x1, z: PARK.steleWalk.z, bays: 8,
  });
  group.add(walk);
  for (let i = 0; i <= 4; i++) {
    anchors.lampPosts.push([PARK.steleWalk.x0 + (i * (PARK.steleWalk.x1 - PARK.steleWalk.x0)) / 4, PARK.steleWalk.z + 3.2]);
  }

  /* ------------------------------------------------------------ 园南入口门坊 */
  const gateObj = gate(M, { x: PARK.gate.x, z: PARK.gate.z, name: '文笔夕照' });
  group.add(gateObj);
  anchors.doorGlows.push([PARK.gate.x, GROUND_Y + 2.9, PARK.gate.z + 0.9]);
  anchors.lampPosts.push([PARK.gate.x - 6.4, PARK.gate.z + 2.6], [PARK.gate.x + 6.4, PARK.gate.z + 2.6]);

  /* ------------------------------------------------------------ 园墙：今景区范围的写意围合 */
  const W = { x0: -112, x1: 112, z0: -112, z1: 104 };
  group.add(wallRun(M, W.z1 - W.z0, [W.x0, (W.z0 + W.z1) / 2], Math.PI / 2));
  group.add(wallRun(M, W.z1 - W.z0, [W.x1, (W.z0 + W.z1) / 2], Math.PI / 2));
  group.add(wallRun(M, W.x1 - W.x0, [(W.x0 + W.x1) / 2, W.z0], 0));
  // 南面开门洞：入口甬道正对塔
  const gap = { x: PARK.gate.x, w: 13 };
  const left = gap.x - gap.w / 2 - W.x0;
  const right = W.x1 - (gap.x + gap.w / 2);
  group.add(wallRun(M, left, [W.x0 + left / 2, W.z1], 0));
  group.add(wallRun(M, right, [W.x1 - right / 2, W.z1], 0));

  /* ------------------------------------------------------------ 塔前甬道两侧的灯位 */
  for (const z of [26, 38, 50]) {
    anchors.lampPosts.push([2.2, z], [11.8, z]);
  }
  return { group, anchors, M };
}
