/**
 * 桥头堡：南北各一对、共四座。主塔高约 70 米、宽 11 米，顶尖是高 5 米、
 * 长 8 米的钢制"三面红旗"；堡前各立一组高 10 余米的"工农兵学商"五人雕塑。
 * 大小堡的分配、侧塔与堡基广场的形制查无记载，此处按主塔+侧塔成组补配（写意）。
 *
 * 每座堡在自己的局部坐标里建模（原点＝广场地坪上的塔心），再整体摆到桥上坐标，
 * 免得绝对/局部两套写法混在一处。
 */
import * as THREE from 'three';
import { TOWER, groundY } from './data.js';
import { M, box, mesh, loft, cyl, halo, rand, remat } from './kit.js';

const { h, w, d, plazaY, flagH, flagL, minorH, minorW, statueH, x: TX, z: TZ } = TOWER;

const rect = () => [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** 塔身四段收分 + 顶檐处一回放（标高从广场起算） */
function towerLevels() {
  return [
    { y: 0, cx: 0, cz: 0, sx: w / 2, sz: d / 2 },
    { y: 16, cx: 0, cz: 0, sx: w / 2, sz: d / 2 },
    { y: 34, cx: 0, cz: 0, sx: (w / 2) * 0.92, sz: (d / 2) * 0.92 },
    { y: 52, cx: 0, cz: 0, sx: (w / 2) * 0.82, sz: (d / 2) * 0.82 },
    { y: h - 6, cx: 0, cz: 0, sx: (w / 2) * 0.74, sz: (d / 2) * 0.74 },
    { y: h - 1.2, cx: 0, cz: 0, sx: (w / 2) * 0.88, sz: (d / 2) * 0.88 },
  ];
}

/** 三面红旗：三片 8 米长、5 米高的钢旗作飞跃前进之状 */
function addFlags(parent) {
  const grp = new THREE.Group();
  grp.name = 'flags';
  for (let i = 0; i < 3; i++) {
    const yaw = (i - 1) * 0.3;
    const g = new THREE.Group();
    g.add(mesh([
      box(flagL * 0.62, flagH, 0.22, flagL * 0.31, 0, 0),
      box(flagL * 0.4, flagH * 0.86, 0.2, flagL * 0.78, flagH * 0.08, 0.5),
    ], M.flag));
    g.add(mesh(box(0.24, flagH + 2.4, 0.24, -0.18, -1.4, 0), M.steelDark));
    g.position.set((i - 1) * 1.1, 0, (i - 1) * 2.6);
    g.rotation.set(-0.1, yaw, 0.05);
    grp.add(g);
    halo(grp, flagL * 0.42 + (i - 1) * 1.1, flagH * 0.45, (i - 1) * 2.6, 13, '255,76,40', { opacity: 0.42, hard: 0.14 });
  }
  grp.position.set(0, h + 1.8, 0);
  parent.add(grp);
  return grp;
}

/** 堡身竖向长窗：夜里从堡内透出的一线光（窗的形式与照明皆写意） */
function addWindows(parent) {
  const parts = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      parts.push(box(0.12, 20 - i * 3.2, 0.66, sx * (w / 2 - 0.02), 11 + i * 9.5, 0));
    }
  }
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      parts.push(box(w * 0.46, 0.12, 17 - i * 3.4, 0, 13 + i * 11, sz * (d / 2 - 0.02)));
    }
  }
  const m = mesh(parts, M.win);
  m.name = 'tower-windows';
  parent.add(m);
}

/** 五人雕塑：工农兵学商，只给体势（写意） */
function addStatues(parent, dx, dz) {
  const grp = new THREE.Group();
  grp.name = 'statues';
  grp.add(mesh(cyl(8.6, 9.2, 1.0, 14, 0, 0, 0), M.stone));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 1.2 + 0.2;
    const px = Math.cos(a) * 4.8, pz = Math.sin(a) * 2.8;
    const hh = statueH * (0.8 + rand() * 0.2);
    grp.add(mesh([
      box(1.1, hh * 0.6, 0.78, px, 1.0, pz),
      box(0.74, hh * 0.22, 0.58, px, 1.0 + hh * 0.6, pz),
      cyl(0.34, 0.3, hh * 0.14, 8, px, 1.0 + hh * 0.82, pz),
      box(0.15, hh * 0.46, 0.15, px + 0.62, 1.0 + hh * 0.52, pz),
    ], M.statue));
  }
  grp.position.set(dx, 0, dz);
  parent.add(grp);
  return grp;
}

/** 一座堡：主塔 + 侧塔 + 翼楼，落在局部原点 (0,0,0) = 广场地坪上的塔心 */
function towerUnit(side) {
  const grp = new THREE.Group();
  grp.name = `tower.pair.${side > 0 ? 'e' : 'w'}`;

  grp.add(mesh(loft(towerLevels(), rect(), { uvScale: 3.4 }), M.tower));
  grp.add(mesh([
    box(w + 2.8, 1.2, d + 2.2, 0, h - 1.2, 0),
    box(3.4, 2.0, 3.4, 0, h, 0),
  ], M.towerTrim));
  addFlags(grp);
  addWindows(grp);

  // 侧塔：主塔外侧一柱，形制为写意
  const mx = side * 15.5;
  grp.add(mesh([
    box(minorW, minorH, minorW * 0.9, mx, 0, -5),
    box(minorW + 1.5, 0.9, minorW + 1.3, mx, minorH, -5),
    cyl(1.2, 0.5, 3.4, 8, mx, minorH + 0.9, -5),
  ], M.tower));
  // 翼楼把主塔与侧塔连成一组
  grp.add(mesh([
    box(15.0, 8.4, 9.2, side * 7.8, 0, 4.5),
    box(16.0, 0.7, 10.0, side * 7.8, 8.4, 4.5),
  ], M.towerTrim));

  // 广场灯柱两根（写意）
  for (const s of [-1, 1]) {
    const px = side * 24 + s * 5, pz = 24;
    grp.add(mesh(cyl(0.3, 0.24, 7.2, 8, px, 0, pz), M.concrete));
    const g = mesh(cyl(0.95, 0.72, 0.95, 10, px, 7.2, pz), M.lampGlobe);
    g.name = 'plaza-lamp';
    grp.add(g);
    halo(grp, px, 7.7, pz, 7, '255,222,170', { opacity: 0.5 });
  }
  return grp;
}

export function buildTowers(scene) {
  const root = new THREE.Group();
  root.name = 'towers';
  const list = [];

  /* 堡基广场：整平的一大片，南北各一块（形制写意） */
  for (const sgn of [1, -1]) {
    const cz = sgn * TZ;
    const g0 = Math.min(groundY(0, cz - 40), groundY(0, cz + 40));
    const fillH = Math.max(1.0, plazaY - g0 + 0.8);
    root.add(mesh([
      box(104, fillH, 158, 0, g0 - 0.8, cz),
      box(108, 0.5, 162, 0, plazaY - 0.5, cz),
    ], remat(M.plaza, 42, 64)));
  }

  for (const sgn of [1, -1]) {
    for (const side of [-1, 1]) {
      const unit = towerUnit(side);
      unit.position.set(side * TX, plazaY, sgn * TZ);
      root.add(unit);
      // 堡前一组五人雕塑：四座堡各一组，摆在靠岸一侧
      addStatues(unit, side * 7, sgn * 30);
      list.push({
        unit, side, sgn,
        worldX: side * TX, worldZ: sgn * TZ,
        topY: plazaY + h + 1.8,
      });
    }
  }
  scene.add(root);

  /* 真实灯光：四座主塔各一盏投光，从广场往上打（其余亮面都走发光材质） */
  const washes = [];
  for (const t of list) {
    const sp = new THREE.SpotLight('#ffe2be', 1700, 122, 0.6, 0.4, 2);
    // 投光从堡外侧的广场角上往上打：机位也在外侧，才拍得到被照的那一面
    sp.position.set(t.worldX + t.side * 21, plazaY + 2.0, t.worldZ + t.sgn * 33);
    sp.target.position.set(t.worldX, plazaY + h * 0.5, t.worldZ);
    scene.add(sp, sp.target);
    t.spot = sp;
    washes.push(sp);
  }
  for (const sgn of [1, -1]) {
    const pool = new THREE.PointLight('#ffd6a8', 360, 52, 2);
    pool.position.set(0, plazaY + 8, sgn * (TZ + 34));
    scene.add(pool);
    washes.push(pool);
  }

  return {
    group: root,
    list,
    /** 红旗与堡灯跟着"齐明"的进度走；k=0 时留一份底光，免得静帧里堡是全黑 */
    setGlow(k) {
      M.flag.emissiveIntensity = 0.26 + 0.44 * k;
      for (const w of washes) {
        const base = w.isSpotLight ? 1700 : 360;
        w.intensity = base * (0.42 + 0.58 * k);
      }
    },
  };
}
