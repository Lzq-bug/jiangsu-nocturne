/**
 * 江上的活气：上层车流、下层列车、江心货轮与小艇。
 * 车与船都不考据——它们只为让 4589 米的公路桥与 6772 米的铁路桥在夜里读得出"在用"。
 */
import * as THREE from 'three';
import { APPROACH, GIRDER, SHIP, RIVER, roadY, railY } from './data.js';
import { M, box, mesh, cyl, halo, rand, rr } from './kit.js';

const LANES = [-5.4, -1.9, 1.9, 5.4];          // 15 米车行道分四幅（可容 4 辆大型汽车并行）
const Z0 = APPROACH.northEnd, Z1 = APPROACH.southEnd;

/* ------------------------------------------------------------------ 车流 */

function cars(scene) {
  const perLane = 7;
  const n = LANES.length * perLane;
  const headGeo = new THREE.BoxGeometry(0.42, 0.24, 0.3);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4a36, toneMapped: false, fog: false });
  const heads = new THREE.InstancedMesh(headGeo, headMat, n * 2);
  const tails = new THREE.InstancedMesh(headGeo, tailMat, n * 2);
  heads.name = 'car-heads'; tails.name = 'car-tails';
  const items = [];
  for (let li = 0; li < LANES.length; li++) {
    const dir = li < 2 ? 1 : -1;                       // 南行/北行分幅
    for (let k = 0; k < perLane; k++) {
      items.push({
        x: LANES[li], dir,
        z: rr(Z0, Z1),
        v: 9 + rand() * 5,
        gap: 0.95 + rand() * 0.4,
      });
    }
  }
  scene.add(heads, tails);
  const d = new THREE.Object3D();
  let gain = 1;
  function update(dt) {
    let i = 0;
    for (const c of items) {
      c.z += c.dir * c.v * dt;
      if (c.z > Z1) c.z = Z0; if (c.z < Z0) c.z = Z1;
      const y = roadY(c.z) + 0.62;
      const lead = c.z + c.dir * c.gap;
      const fall = c.z - c.dir * c.gap;
      for (const s of [-0.62, 0.62]) {
        d.position.set(c.x + s, y, lead);
        d.scale.setScalar(gain);
        d.updateMatrix();
        heads.setMatrixAt(i, d.matrix);
        d.position.set(c.x + s, y, fall);
        d.updateMatrix();
        tails.setMatrixAt(i, d.matrix);
        i++;
      }
    }
    heads.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return {
    heads, tails,
    setGain(k) { gain = k; },
    update,
  };
}

/* ------------------------------------------------------------------ 列车 */

function train(scene, columns) {
  const CARS = 13;
  const LEN = 24.5, GAP = 1.1, W = 3.0, H = 3.9;
  const bodyGeo = new THREE.BoxGeometry(W, H, LEN);
  const body = new THREE.InstancedMesh(bodyGeo, M.steelDark, CARS);
  body.name = 'train-body';
  const winGeo = new THREE.BoxGeometry(W + 0.06, 0.62, LEN * 0.78);
  const winMat = new THREE.MeshBasicMaterial({ color: '#ffd9a2', toneMapped: false, fog: false });
  winMat.color.multiplyScalar(0.85);
  const win = new THREE.InstancedMesh(winGeo, winMat, CARS);
  win.name = 'train-windows';
  scene.add(body, win);

  const head = halo(scene, 0, 0, 0, 26, '255,246,226', { opacity: 0.7, hard: 0.1 });
  head.name = 'train-headlight';

  const z0 = APPROACH.southEnd - 200;
  const st = { on: false, z: z0, dir: -1, v: 17, colIdx: columns.add(new THREE.Vector3(0, 0, z0), '#ffdfae', 2.6, 16, 0.8) };
  const d = new THREE.Object3D();
  function place() {
    for (let i = 0; i < CARS; i++) {
      const z = st.z + st.dir * i * (LEN + GAP);
      const y = railY(z) + 0.16;
      const slope = (railY(z + 4) - railY(z - 4)) / 8;
      d.position.set(-GIRDER.trackX, y + H / 2, z);
      d.rotation.set(0, 0, -Math.atan(slope));
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix);
      d.position.y = y + H * 0.62;
      d.updateMatrix();
      win.setMatrixAt(i, d.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    win.instanceMatrix.needsUpdate = true;
    const y = railY(st.z) + 0.16 + H * 0.55;
    head.position.set(-GIRDER.trackX, y, st.z + st.dir * (LEN * 0.6));
    head.visible = st.on;
    body.visible = st.on; win.visible = st.on;
    columns.setPos(st.colIdx, new THREE.Vector3(-GIRDER.trackX, 0, st.z));
    columns.setScale(st.colIdx, st.on ? 1.1 : 0);
  }
  place();
  return {
    state: st,
    release(snap) {
      st.on = true;
      st.z = snap ? 40 : APPROACH.southEnd - 200;
      place();
    },
    recall() { st.on = false; place(); },
    update(dt) {
      if (!st.on) return;
      st.z += st.dir * st.v * dt;
      if (st.z < APPROACH.northEnd + 120) { st.on = false; }
      place();
    },
    set on(v) { st.on = v; place(); },
    get on() { return st.on; },
  };
}

/* ------------------------------------------------------------------ 船 */

function cargoShip(scene, columns) {
  const grp = new THREE.Group();
  grp.name = 'cargo-ship';
  const { length, beam, deckY, x0 } = SHIP;
  const deck = deckY - 0.4;                 // 局部高程：群原点在水线上 0.4
  const hull = [
    // 船体三段收出艏艉的侧影：吃水约 5 米，干舷到艏楼甲板
    box(length * 0.5, deck + 5.2, beam, -length * 0.16, -5.2, 0),
    box(length * 0.3, deck + 4.6, beam * 0.86, length * 0.24, -4.6, 0),
    box(length * 0.14, deck + 4.0, beam * 0.56, length * 0.44, -4.0, 0),
    box(length * 0.98, 0.8, beam * 0.96, 0, deck - 0.8, 0),
  ];
  grp.add(mesh(hull, M.ship));
  // 上层建筑与烟囱在艉
  grp.add(mesh([
    box(17, 9.2, beam * 0.8, -length * 0.34, deck, 0),
    box(13, 3.0, beam * 0.62, -length * 0.34, deck + 9.2, 0),
    box(4.2, 5.4, 4.2, -length * 0.3, deck + 12.2, 0),
  ], M.concrete));
  // 货舱在船中：舱口盖堆到艏楼之前，留出艏楼机位
  const holds = [];
  for (let i = 0; i < 3; i++) {
    const hx = -length * 0.14 + i * 15;
    holds.push(box(12, 3.6, beam * 0.82, hx, deck, 0));
    holds.push(box(12.6, 0.7, beam * 0.88, hx, deck + 3.6, 0));
  }
  grp.add(mesh(holds, M.steelDark));
  // 前桅与艏楼
  grp.add(mesh([
    cyl(0.45, 0.28, 11, 6, length * 0.3, deck, 0),
    box(9, 1.6, beam * 0.5, length * 0.4, deck, 0),
  ], M.steelDark));
  // 舷侧与甲板灯
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const x = -length * 0.42 + i * (length * 0.84 / 7);
    lamps.push(box(0.7, 0.7, 0.7, x, deck + 1.4, beam * 0.4));
    lamps.push(box(0.7, 0.7, 0.7, x, deck + 1.4, -beam * 0.4));
  }
  for (let i = 0; i < 4; i++) lamps.push(box(0.8, 0.8, 0.8, -length * 0.34 + i * 4, deck + 10.0, 0));
  grp.add(mesh(lamps, M.shipWin));
  grp.add(mesh(box(0.8, 0.8, 0.8, length * 0.3, deck + 11.2, 0), M.markRed));
  halo(grp, length * 0.3, deck + 11.2, 0, 3.4, '255,90,64', { opacity: 0.4 });
  halo(grp, -length * 0.34, deck + 11.0, 0, 5, '255,228,188', { opacity: 0.35 });

  const st = {
    x: x0, z: SHIP.channelZ, v: 1.4,
    colIdx: columns.add(new THREE.Vector3(x0, 0, SHIP.channelZ), '#ffd9a0', 5.6, 21, 1.0),
  };
  grp.position.set(st.x, 0.4, st.z);
  scene.add(grp);
  return {
    grp, state: st, deckY,
    setPos(x) {
      st.x = x; grp.position.x = x;
      columns.setPos(st.colIdx, new THREE.Vector3(x, 0, st.z));
    },
    update(dt) {
      st.x += st.v * dt;
      if (st.x > RIVER.xTo - 200) st.x = -RIVER.xTo + 200;
      grp.position.x = st.x;
      grp.position.y = 0.4 + Math.sin(st.x * 0.05) * 0.14;
      columns.setPos(st.colIdx, new THREE.Vector3(st.x, 0, st.z));
    },
  };
}

function smallBoats(scene, columns) {
  const grp = new THREE.Group();
  grp.name = 'boats';
  const list = [];
  /* 第一只固定停在 3 号墩下游侧（x=-34, z=336）——『墩前』那机位就站在它舵楼前，
     不然那是一双悬在江面上的眼睛。 */
  for (let i = 0; i < 3; i++) {
    const x = i === 0 ? -34 : rr(-900, 900);
    const z = i === 0 ? 336 : rr(-RIVER.waterHalf + 120, RIVER.waterHalf - 120);
    const b = mesh([
      box(9, 1.6, 3.0, 0, 0, 0),
      box(3.2, 2.0, 2.4, -2.2, 1.6, 0),
    ], M.ship);
    b.position.set(x, 0.4, z);
    grp.add(b);
    grp.add(mesh(box(0.6, 0.6, 0.6, x - 2.2, 4.0, z), M.markGreen));
    const c = columns.add(new THREE.Vector3(x, 0, z), '#8fe8c0', 1.1, 7, 0.7);
    list.push({ b, x, z, v: 2.2 + rand() * 1.6, dir: rand() > 0.5 ? 1 : -1, c });
  }
  scene.add(grp);
  return {
    grp, list,
    update(dt) {
      for (const o of list) {
        o.x += o.dir * o.v * dt;
        if (o.x > 260 || o.x < -1500) o.dir *= -1;
        o.b.position.x = o.x;
        o.b.position.y = 0.4 + Math.sin(o.x * 0.08) * 0.12;
        columns.setPos(o.c, new THREE.Vector3(o.x, 0, o.z));
      }
    },
  };
}

/* ------------------------------------------------------------------ 航标灯的闪 */

function beacons(scene, buoyLightMat) {
  let p = 0;
  return {
    update(t) {
      p = 0.5 + 0.5 * Math.sin(t * 1.6);
      buoyLightMat.color.setRGB(1.2 * (0.25 + p), 0.34 * (0.2 + p * 0.6), 0.25 * (0.2 + p * 0.6));
    },
  };
}

/* ------------------------------------------------------------------ 装配 */

export function buildMotion(scene, columns, buoy) {
  const car = cars(scene);
  const rail = train(scene, columns);
  const ship = cargoShip(scene, columns);
  const boats = smallBoats(scene, columns);
  const bc = buoy ? beacons(scene, M.markRed) : null;
  return {
    group: new THREE.Group(),
    cars: car,
    train: rail,
    ship,
    boats,
    releaseTrain({ snap = false } = {}) { rail.release(snap); },
    setTraffic(k) { car.setGain(0.35 + 0.65 * k); },
    update(t, dt) {
      car.update(dt);
      rail.update(dt);
      ship.update(dt);
      boats.update(dt);
      if (bc) bc.update(t);
    },
  };
}

