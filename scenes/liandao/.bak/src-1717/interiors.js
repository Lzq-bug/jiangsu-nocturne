import * as THREE from 'three';
import { glow, lit, mesh, box, rand, rr, M } from './kit.js';
import * as T from './textures.js';
import { LAYOUT } from './architecture.js';
import { LIGHTHOUSE, BUOYS, CHANNEL, QUAY } from './layout.js';
import { GAUGE } from './data.js';

/**
 * 两处进得去的内部：灯塔灯室，和泊在停泊区最前面那条船（驾驶室 + 后甲板）。
 * 灯室按 LIGHTHOUSE.focal 架在塔顶，是静止的；船的内部挂成船的子节点，
 * 潮位抬多少、船摇多少都不必在这里管——它跟着船走。
 *
 * 灯室地坪 = focal - 2.3：portals.js 的室内视角用同一个算法，两处别改。
 */
const OPTIC_Y = LIGHTHOUSE.focal;
const FLOOR_Y = OPTIC_Y - 2.3;
const ROOM_R = 2.8;
const CEIL_Y = 3.5;
/** 船体局部原点约在舷边/水面，站进舷内空腔后的甲板面 */
const DECK = 0.12;

/** 两面都看得见的材质：室内界面必须从里面也读得出来 */
function both(mat) {
  if (!mat || !mat.clone) return mat;
  if (mat.side === THREE.DoubleSide) return mat;
  const c = mat.clone();
  c.side = THREE.DoubleSide;
  return c;
}

/** 门上/门内各一处：返回 { update(t, level) }，其余字段留给调试 */
export function buildInteriors(scene, lead) {
  const boat = lead && lead.isObject3D ? lead : (lead && lead.obj && lead.obj.isObject3D ? lead.obj : null);
  const tower = buildLampRoom(scene);
  const cabin = boat ? buildWheelhouse(boat) : null;

  return {
    tower, cabin,
    update(t, level) {
      updateLampRoom(tower, t, level);
      if (cabin) updateWheelhouse(cabin, t, level);
    },
  };
}

/* ------------------------------------------------------------------ 灯室 */

function buildLampRoom(scene) {
  const base = LAYOUT.tower && LAYOUT.tower.pos ? LAYOUT.tower.pos : new THREE.Vector3(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
  const grp = new THREE.Group();
  grp.position.set(base.x, FLOOR_Y, base.z);
  scene.add(grp);

  const steel = lit('#5a636f', { map: T.rust(), rough: 0.74, metal: 0.5, emissive: '#0d1117', ei: 0.4, side: THREE.DoubleSide });
  const wallMat = lit('#767e89', { map: T.concrete(), rough: 0.92, emissive: '#10141b', ei: 0.4, side: THREE.DoubleSide });
  const glass = both(M.glass);
  const d = new THREE.Object3D();

  // 地坪、天花
  // 地坪留一个舱口：旋梯就是从这块洞眼里往下掉的
  const shape = new THREE.Shape();
  shape.absarc(0, 0, ROOM_R, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 1.5, 0.66, 0, Math.PI * 2, true);   // 旋转 -90° 之后局部 +Y 落在 -Z，正对朝陆那一侧
  shape.holes.push(hole);
  const floorGeo = new THREE.ShapeGeometry(shape, 26);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, both(lit('#4a525d', { map: T.plank(), rough: 0.9, emissive: '#0a0d12', ei: 0.35 })));
  grp.add(floor);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R + 0.1, 26), steel);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = CEIL_Y;
  grp.add(ceil);

  // 半人高的墩墙 + 一圈玻璃 + 竖窗棂：窗外是海州湾、口门与港池的灯火
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(ROOM_R, ROOM_R, 1.05, 26, 1, true), wallMat);
  drum.position.y = 0.52;
  grp.add(drum);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(ROOM_R, ROOM_R, 2.3, 26, 1, true), glass);
  band.position.y = 2.2;
  grp.add(band);
  const mullions = new THREE.InstancedMesh(box(0.1, 2.3, 0.12, 0, 0, 0), steel, 10);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.16;
    d.position.set(Math.sin(a) * ROOM_R, 2.2, Math.cos(a) * ROOM_R);
    d.rotation.set(0, a, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    mullions.setMatrixAt(i, d.matrix);
  }
  grp.add(mullions);
  // 上下两道箍
  for (const y of [1.06, 3.34]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(ROOM_R, 0.06, 6, 34), steel);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    grp.add(hoop);
  }

  // 外廊：一圈栏板，推门出去就是塔顶的风
  const walk = new THREE.Mesh(new THREE.RingGeometry(ROOM_R + 0.05, ROOM_R + 1.3, 26), both(M.concrete));
  walk.rotation.x = -Math.PI / 2;
  walk.position.y = 0.02;
  grp.add(walk);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(ROOM_R + 1.2, 0.05, 6, 34), M.metal);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 1.02;
  grp.add(rail);
  const posts = new THREE.InstancedMesh(box(0.06, 1.0, 0.06, 0, 0, 0), M.metal, 22);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    d.position.set(Math.sin(a) * (ROOM_R + 1.2), 0.5, Math.cos(a) * (ROOM_R + 1.2));
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    posts.setMatrixAt(i, d.matrix);
  }
  grp.add(posts);

  /* ------------------------------------------------------------ 透镜组 */
  // 鼓座 + 菲涅尔环带 + 灯芯，整组六秒一转，与 kaiyu.js 塔外那根光柱同相位
  const optic = new THREE.Group();
  optic.position.y = OPTIC_Y - FLOOR_Y;
  grp.add(optic);
  optic.add(mesh([
    box(1.2, 0.2, 1.2, 0, -2.2, 0),
    new THREE.CylinderGeometry(0.3, 0.36, 1.3, 16).translate(0, -1.45, 0),
    new THREE.CylinderGeometry(0.64, 0.8, 0.28, 18).translate(0, -1.02, 0),
    box(1.5, 0.16, 1.5, 0, 1.02, 0),
  ], M.metal));
  optic.add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.7, 22, 1, true), glass));
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.055, 5, 26), glass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.72 + i * 0.29;
    optic.add(ring);
  }
  optic.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), glow('#fff3d0', 3.8)));
  // 两根加性光板：转起来能看到光在墩墙与设备上扫过去
  const sweepMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffeec8').multiplyScalar(1.4), transparent: true, opacity: 0.26,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });
  const sweep = new THREE.Group();
  for (const s of [-1, 1]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.1), sweepMat);
    q.position.set(s * 2.15, -0.2, 0);
    q.rotation.y = s * Math.PI / 2;
    sweep.add(q);
  }
  optic.add(sweep);

  const lampLight = new THREE.PointLight(0xfff0cc, 20, 15, 2);
  lampLight.position.copy(optic.position);
  grp.add(lampLight);
  const spot = new THREE.SpotLight(0xfff2d4, 80, 34, 0.5, 0.8, 1.4);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -1.0, -12);
  optic.add(spot, spotTarget);        // 跟着透镜一起转：光斑在墩墙与设备上扫过去
  spot.target = spotTarget;

  /* ------------------------------------------------------------ 旋梯与舱口 */
  const a0 = Math.PI;                     // 舱口在 -Z 那侧，朝陆
  const SR = 1.5, NS = 26;
  const hatch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 20), M.metal);
  hatch.rotation.x = Math.PI / 2;
  hatch.position.set(Math.sin(a0) * SR, 0.07, Math.cos(a0) * SR);
  grp.add(hatch);
  const stairs = new THREE.InstancedMesh(box(0.92, 0.12, 0.46, 0, 0, 0), both(M.metal), NS);
  const stairLight = box(0.1, 0.05, 0.36, 0, 0, 0);
  const lampGeoGlow = glow('#ffb14e', 1.9);
  for (let i = 0; i < NS; i++) {
    const a = a0 - i * 0.29;
    d.position.set(Math.sin(a) * SR, -0.34 - i * 0.33, Math.cos(a) * SR);
    d.rotation.set(0, -a, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    stairs.setMatrixAt(i, d.matrix);
    if (i % 3 === 0) {                     // 每三阶一盏，梯井里那条橙线就是上灯室的路
      const g = new THREE.Mesh(stairLight, lampGeoGlow);
      g.position.set(Math.sin(a) * (SR + 0.55), -0.16 - i * 0.33, Math.cos(a) * (SR + 0.55));
      g.rotation.y = -a;
      grp.add(g);
    }
  }
  grp.add(stairs);

  /* -------------------------------------------------------- 灯室里的物件 */
  // 潮位牌：值夜的人就靠它看这一涨还剩多少
  const staff = new THREE.Group();
  const staffA = 2.2;
  staff.position.set(Math.sin(staffA) * (ROOM_R - 0.2), 1.62, Math.cos(staffA) * (ROOM_R - 0.2));
  staff.rotation.y = staffA + Math.PI;
  staff.add(new THREE.Mesh(box(0.5, 2.1, 0.06, 0, 0, 0), lit('#c9b48c', { map: T.plank(), rough: 0.9, emissive: '#241a10', ei: 0.5 })));
  const ticks = new THREE.InstancedMesh(box(0.36, 0.02, 0.02, 0, 0, 0), glow('#cfe6ff', 1.2), 7);
  for (let i = 0; i < 7; i++) {
    d.position.set(0, -0.9 + i * 0.3, 0.05);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    ticks.setMatrixAt(i, d.matrix);
  }
  staff.add(ticks);
  const marker = new THREE.Mesh(box(0.5, 0.07, 0.09, 0, 0, 0), glow('#ffcf7a', 2.6));
  staff.add(marker);
  grp.add(staff);

  const plaque = (text, a, w, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.28), new THREE.MeshBasicMaterial({ map: T.sign(text), toneMapped: false, transparent: true }));
    m.position.set(Math.sin(a) * (ROOM_R - 0.16), y, Math.cos(a) * (ROOM_R - 0.16));
    m.rotation.y = a + Math.PI;
    grp.add(m);
    return m;
  };
  plaque('一夜五更 · 潮信', -2.2, 1.5, 2.1);
  plaque('口门 · 左红右绿', 0.5, 1.6, 2.1);

  // 单筒望远镜：架在窗边，指着口门那对红绿灯桩
  const mouthPt = new THREE.Vector3((BUOYS[0].x + BUOYS[1].x) / 2, 0, (BUOYS[0].z + BUOYS[1].z) / 2);
  const spin = Math.atan2(mouthPt.x - base.x, mouthPt.z - base.z);
  const scope = new THREE.Group();
  scope.position.set(Math.sin(spin) * (ROOM_R - 0.55), 1.15, Math.cos(spin) * (ROOM_R - 0.55));
  scope.rotation.set(0.08, spin, 0);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 12), M.metal);
  tube.rotation.x = Math.PI / 2;
  scope.add(tube);
  for (const s of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), M.metal);
    leg.position.set(s, -0.42, 0);
    leg.rotation.z = -s * 0.5;
    scope.add(leg);
  }
  grp.add(scope);

  // 值夜的一张小桌、一盏马灯、一卷缆
  const ba = 4.0;
  const bench = new THREE.Mesh(box(1.1, 0.09, 0.5, 0, 0, 0), both(M.plank));
  bench.position.set(Math.sin(ba) * 1.95, 0.46, Math.cos(ba) * 1.95);
  bench.rotation.y = ba;
  grp.add(bench);
  for (const s of [-0.45, 0.45]) {
    const leg = new THREE.Mesh(box(0.08, 0.42, 0.42, 0, 0, 0), M.plank);
    leg.position.set(bench.position.x + Math.cos(ba) * s, 0.21, bench.position.z - Math.sin(ba) * s);
    leg.rotation.y = ba;
    grp.add(leg);
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd39a').multiplyScalar(2.4), toneMapped: false, fog: false });
  const lantern = new THREE.Group();
  lantern.position.set(bench.position.x, 0.72, bench.position.z);
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.2, 10), bulbMat);
  lantern.add(new THREE.Mesh(box(0.2, 0.04, 0.2, 0, 0.15, 0), M.metal), bulb, new THREE.Mesh(box(0.18, 0.03, 0.18, 0, -0.13, 0), M.metal));
  grp.add(lantern);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 6, 18), M.rope);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(Math.sin(5.2) * 1.95, 0.08, Math.cos(5.2) * 1.95);
  grp.add(coil);

  return { grp, optic, sweepMat, lampLight, spot, marker, bulbMat, bulb };
}

function updateLampRoom(room, t, level) {
  room.optic.rotation.y = (t / LIGHTHOUSE.phase) * Math.PI * 2;   // 与塔外扫光同相位
  room.sweepMat.opacity = 0.2 + 0.08 * Math.sin(t * 3.1);
  room.lampLight.intensity = 20 * (0.93 + 0.07 * Math.sin(t * 7.7) * Math.sin(t * 2.3));
  // 潮位牌上那点黄：从干潮线滑到满潮线
  const k = THREE.MathUtils.clamp((level - GAUGE.lo) / (GAUGE.hi - GAUGE.lo), 0, 1);
  room.marker.position.y = -0.9 + k * 1.8;
}

/* ---------------------------------------------------------------- 驾驶室 */

/**
 * 船的内部：前舱是驾驶室（舵、车钟、鱼探、一盏橘红工作灯），
 * 后面一小块露天后甲板堆网卷、浮子与缆圈。
 * 局部坐标按"船头 = +Z"建好，整组旋到船的真实艏向上去。
 */
function buildWheelhouse(boat) {
  const bow = bowLocal(boat);
  const grp = new THREE.Group();
  grp.rotation.y = Math.atan2(bow.x, bow.z);
  grp.position.y = DECK;
  boat.add(grp);

  const plate = lit('#6d7683', { map: T.rust(), rough: 0.78, metal: 0.45, emissive: '#0e1218', ei: 0.35, side: THREE.DoubleSide });
  const glass = both(M.glass);
  const d = new THREE.Object3D();

  // 驾驶室壳体：四面墙留出前窗带、侧窗带与通往后甲板的门洞
  const W = 1.7, H = 1.7, FD = 0.72;
  grp.add(mesh([
    box(W, 0.82, 0.07, 0, 0.41, FD),                          // 前墙·窗下
    box(W, 0.2, 0.07, 0, H - 0.1, FD),                        // 前墙·窗上
    box(0.07, 0.5, 0.8, -W / 2, 0.25, 0.32),                  // 侧墙·窗下（只到前段）
    box(0.07, 0.5, 0.8, W / 2, 0.25, 0.32),
    box(0.07, 0.7, 0.8, -W / 2, 1.35, 0.32),                  // 侧墙·窗上
    box(0.07, 0.7, 0.8, W / 2, 1.35, 0.32),
    box(0.07, H, 0.64, -W / 2, H / 2, -0.4),                  // 侧墙·后段（实心）
    box(0.07, H, 0.64, W / 2, H / 2, -0.4),
    box(0.45, H, 0.07, -0.62, H / 2, -FD),                    // 后墙·左
    box(0.45, H, 0.07, 0.62, H / 2, -FD),                     // 后墙·右
    box(0.8, 0.3, 0.07, 0, H - 0.15, -FD),                    // 后墙·门楣
    box(W + 0.16, 0.1, 1.6, 0, H + 0.05, 0),                  // 顶
  ], plate));
  const floor = new THREE.Mesh(box(W - 0.1, 0.06, 1.5, 0, 0.03, 0), both(M.plank));
  grp.add(floor);

  // 前窗与侧窗：透过它就是港池那一片桅灯
  const win = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    grp.add(m);
    return m;
  };
  win(W - 0.12, 0.66, 0, 1.16, FD - 0.03, 0);
  win(0.7, 0.46, -W / 2 + 0.03, 0.75, 0.32, Math.PI / 2);
  win(0.7, 0.46, W / 2 - 0.03, 0.75, 0.32, -Math.PI / 2);
  for (const s of [-0.44, 0, 0.44]) grp.add(new THREE.Mesh(box(0.06, 0.68, 0.1, s, 1.16, FD), M.metal));

  /* ------------------------------------------------------------ 舵 */
  const helm = new THREE.Group();
  helm.position.set(0, 1.02, 0.26);
  helm.rotation.x = -0.34;
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.042, 8, 24), M.rope));
  const spokes = new THREE.InstancedMesh(box(0.62, 0.05, 0.05, 0, 0, 0), M.metal, 4);
  for (let i = 0; i < 4; i++) {
    d.position.set(0, 0, 0);
    d.rotation.set(0, 0, (i / 4) * Math.PI);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    spokes.setMatrixAt(i, d.matrix);
  }
  wheel.add(spokes, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 10), M.metal));
  const handleGeo = new THREE.CylinderGeometry(0.026, 0.03, 0.14, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = new THREE.Mesh(handleGeo, M.plank);
    h.position.set(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0);
    h.rotation.z = a + Math.PI / 2;
    wheel.add(h);
  }
  helm.add(wheel);
  grp.add(helm);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 8), M.metal);
  post.position.set(0, 0.5, 0.3);
  post.rotation.x = -0.34;
  grp.add(post);

  /* ------------------------------------------------------------ 仪表台 */
  grp.add(mesh([
    box(1.5, 0.46, 0.34, 0, 0.5, 0.62),
    box(1.5, 0.1, 0.44, 0, 0, 0).rotateX(-0.3).translate(0, 0.8, 0.58),
  ], plate));
  // 车钟：一根红头小杆
  const bellLever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), M.metal);
  bellLever.position.set(-0.52, 0.94, 0.52);
  bellLever.rotation.z = 0.55;
  const bellKnob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow('#ff6a5a', 1.9));
  bellKnob.position.set(-0.58, 1.05, 0.52);
  grp.add(bellLever, bellKnob);
  // 罗经盆
  const binnacle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 16), both(M.glass));
  binnacle.position.set(-0.16, 0.9, 0.7);
  grp.add(binnacle);
  const card = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), lit('#dfe4ea', { rough: 0.7, emissive: '#20262e', ei: 0.6 }));
  card.rotation.x = -Math.PI / 2;
  card.position.set(-0.16, 0.88, 0.7);
  grp.add(card);
  const needle = new THREE.Mesh(box(0.02, 0.01, 0.12, 0, 0, 0), glow('#ff6a5a', 1.6));
  needle.position.set(-0.16, 0.895, 0.7);
  grp.add(needle);
  for (let i = 0; i < 5; i++) {
    const sw = new THREE.Mesh(box(0.05, 0.05, 0.05, 0.2 + i * 0.12, 0.88, 0.6), glow(i % 2 ? '#3dff9a' : '#ffd36a', 1.5));
    sw.rotation.x = -0.3;
    grp.add(sw);
  }

  // 鱼探：绿屏一条往上爬的扫描线，水深条跟着当前潮位起落
  const sonar = new THREE.Group();
  sonar.position.set(0.5, 1.06, 0.52);
  sonar.rotation.x = -0.3;
  sonar.add(new THREE.Mesh(box(0.44, 0.34, 0.12, 0, 0, 0), lit('#191f27', { rough: 0.6, metal: 0.4, side: THREE.DoubleSide })));
  const screenMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#3dff9a').multiplyScalar(1.5), transparent: true, opacity: 0.8,
    toneMapped: false, fog: false, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), screenMat);
  screen.position.z = 0.07;
  sonar.add(screen);
  const sweepBar = new THREE.Mesh(box(0.34, 0.014, 0.01, 0, 0, 0), glow('#bfffe0', 2.4));
  sweepBar.position.z = 0.08;
  sonar.add(sweepBar);
  const depthBar = new THREE.Mesh(box(0.05, 0.2, 0.014, 0, 0, 0), glow('#8fb8ff', 2.0));
  depthBar.position.set(-0.18, 0, 0.08);
  sonar.add(depthBar);
  grp.add(sonar);

  /* ------------------------------------------------------------ 工作灯 */
  const work = new THREE.Group();
  work.position.set(-0.5, 1.5, -0.3);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 5), M.metal);
  hook.position.y = 0.16;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.15, 12, 1, true), lit('#8a4a18', { rough: 0.6, metal: 0.5, side: THREE.DoubleSide }));
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(2.8), toneMapped: false, fog: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bulbMat);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 5, 14), M.metal);
  cage.rotation.x = Math.PI / 2;
  const cageWires = new THREE.InstancedMesh(box(0.012, 0.2, 0.012, 0, 0, 0), M.metal, 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    d.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    cageWires.setMatrixAt(i, d.matrix);
  }
  work.add(hook, shade, bulb, cage, cageWires);
  const workLight = new THREE.PointLight(0xff8a3c, 10, 7.5, 2);
  workLight.position.y = -0.06;
  work.add(workLight);
  grp.add(work);
  // 顶上一条薄灯带，内舱不至于全黑
  grp.add(new THREE.Mesh(box(1.4, 0.03, 0.05, 0, H - 0.04, -0.2), glow('#ffb14e', 1.6)));

  /* ------------------------------------------------------------ 后甲板 */
  const deck = new THREE.Mesh(box(W - 0.05, 0.05, 2.7, 0, 0.02, -2.2), both(M.plank));
  grp.add(deck);

  // 卷网机 + 一筒绞好的网衣
  const reel = new THREE.Group();
  reel.position.set(0, 0.38, -2.15);
  const drumGeo = new THREE.CylinderGeometry(0.34, 0.34, 1.15, 16);
  drumGeo.rotateZ(Math.PI / 2);
  reel.add(new THREE.Mesh(drumGeo, new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8c9098'), map: T.net(), roughness: 0.95,
    emissive: new THREE.Color('#141a14'), emissiveIntensity: 0.5,
  })));
  for (const s of [-0.6, 0.6]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16), M.metal);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = s;
    reel.add(cap);
  }
  reel.add(mesh([box(0.12, 0.36, 0.12, -0.68, -0.2, 0), box(0.12, 0.36, 0.12, 0.68, -0.2, 0)], M.metal));
  grp.add(reel);

  // 散网一堆
  const netMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6f7a6c'), map: T.net(), roughness: 0.98,
    emissive: new THREE.Color('#10140f'), emissiveIntensity: 0.5, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const r = rr(0.24, 0.38);
    const pile = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), netMat);
    pile.position.set(rr(-0.55, 0.55), 0.05 + r * 0.55, -2.75 - i * 0.3 + rr(-0.08, 0.08));
    pile.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    pile.scale.set(1, 0.65, 1);
    grp.add(pile);
  }
  // 一串浮子：拴在缆圈上，明早撑网就用它们
  const floatGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const floats = new THREE.InstancedMesh(floatGeo, lit('#d8622a', { rough: 0.55, emissive: '#2a1006', ei: 0.6 }), 7);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    d.position.set(-0.6 + Math.cos(a) * 0.26, 0.16, -2.4 + Math.sin(a) * 0.26);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    floats.setMatrixAt(i, d.matrix);
  }
  grp.add(floats);
  const lash = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 5, 18), M.rope);
  lash.rotation.x = Math.PI / 2;
  lash.position.set(-0.6, 0.3, -2.4);
  grp.add(lash);

  // 缆圈两只、水桶一只、压舱块一段
  const coils = new THREE.InstancedMesh(new THREE.TorusGeometry(0.24, 0.055, 6, 16), M.rope, 2);
  for (let i = 0; i < 2; i++) {
    d.position.set(0.62, 0.09 + i * 0.06, -1.35 - i * 0.04);
    d.rotation.set(Math.PI / 2, 0, 0);
    d.scale.set(1 - i * 0.14, 1 - i * 0.14, 1);
    d.updateMatrix();
    coils.setMatrixAt(i, d.matrix);
  }
  grp.add(coils);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.26, 10), both(M.metal));
  bucket.position.set(0.6, 0.15, -3.0);
  grp.add(bucket);
  grp.add(new THREE.Mesh(box(0.5, 0.26, 0.34, 0, 0.15, -3.3), M.concrete));

  return { grp, wheel, screenMat, sweepBar, depthBar, bulbMat, bulb, workLight, needle };
}

function updateWheelhouse(cabin, t, level) {
  // 舵一直在找正：夜里那点偏转很小
  cabin.wheel.rotation.z = Math.sin(t * 0.45) * 0.5 + Math.sin(t * 1.7) * 0.08;
  cabin.needle.rotation.y = Math.sin(t * 0.3) * 0.25;
  const f = 0.9 + 0.1 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
  cabin.bulbMat.color.copy(new THREE.Color('#ff7a2a').multiplyScalar(2.8 * f));
  cabin.workLight.intensity = 10 * f;
  // 鱼探：扫描线往上爬，水深条按当前潮位给高低
  cabin.sweepBar.position.y = ((t * 0.42) % 1) * 0.22 - 0.11;
  const k = THREE.MathUtils.clamp((level - GAUGE.lo) / (GAUGE.hi - GAUGE.lo), 0, 1);
  cabin.depthBar.scale.y = 0.35 + 0.65 * k;
  cabin.screenMat.opacity = 0.7 + 0.2 * Math.abs(Math.sin(t * 1.3));
}

/**
 * 船头的局部朝向：停泊时船头大致朝着航道出口，把那个世界方向折回船的局部坐标，
 * 再吸附到最近的直角轴。props 若给了 userData.bow 就以它为准。
 */
function bowLocal(boat) {
  const o = boat.userData && boat.userData.bow;
  if (o) {
    const v = new THREE.Vector3(o[0] || 0, 0, o[1] || 0);
    if (v.lengthSq() > 1e-6) return v.normalize();
  }
  const exit = CHANNEL.length > 1 ? CHANNEL[CHANNEL.length - 2] : [QUAY.pts[0][0], QUAY.pts[0][1]];
  const dir = new THREE.Vector3(exit[0] - boat.position.x, 0, exit[1] - boat.position.z);
  if (dir.lengthSq() < 1) return new THREE.Vector3(0, 0, 1);
  const a = Math.atan2(dir.x, dir.z) - (boat.rotation.y || 0);
  const k = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  return new THREE.Vector3(Math.sin(k), 0, Math.cos(k));
}
