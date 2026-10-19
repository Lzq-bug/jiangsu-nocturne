/**
 * 惠山寺：寺依山谷，轴线自古华山门逐级抬升向西北。
 * 真正老的东西是唐经幢与北宋靖康年金莲桥，殿宇多为 2004/2008 年复建。
 */
import * as THREE from 'three';
import { M, glow, lit, box, mesh, rr } from './kit.js';
import * as T from './textures.js';
import { wallRun, hall, groundPad, lanternCluster, moonInPool, cypress } from './build.js';
import { TEMPLE } from './data.js';

const AX = TEMPLE.axisX;

/** 唐经幢：几段八角鼓叠成柱身，顶上一层华盖与幢檐 */
function sutraPillar({ x, z, y }) {
  const grp = new THREE.Group();
  const drums = [], canopies = [], relief = [];
  let h = 0;
  const levels = [
    { r: 1.05, h: 0.5 }, { r: 0.92, h: 0.9 }, { r: 0.82, h: 1.1 },
    { r: 0.72, h: 1.1 }, { r: 0.62, h: 0.9 }, { r: 0.5, h: 0.62 },
  ];
  for (const lv of levels) {
    const g = new THREE.CylinderGeometry(lv.r, lv.r * 1.04, lv.h, 8, 1, false);
    g.translate(0, h + lv.h / 2, 0);
    drums.push(g);
    // 每层的浮雕带
    const band = new THREE.CylinderGeometry(lv.r * 1.02, lv.r * 1.02, 0.2, 8, 1, true);
    band.translate(0, h + lv.h * 0.72, 0);
    relief.push(band);
    h += lv.h;
    const cap = new THREE.CylinderGeometry(lv.r * 0.5, lv.r * 1.28, 0.22, 8);
    cap.translate(0, h + 0.1, 0);
    canopies.push(cap);
  }
  // 幢顶：伞盖 + 宝珠
  const parasol = new THREE.ConeGeometry(1.15, 0.85, 8, 1);
  parasol.translate(0, h + 0.9, 0);
  canopies.push(parasol);
  const bead = new THREE.SphereGeometry(0.26, 9, 7);
  bead.translate(0, h + 1.6, 0);
  canopies.push(bead);
  const stone = lit('#c9ced8', { map: T.stone('#a9aeb9'), rough: 0.88, emissive: '#151b28', ei: 0.45 });
  grp.add(mesh(drums, stone));
  grp.add(mesh(canopies, M.stoneDressed));
  grp.add(mesh(relief, lit('#8f96a3', { map: T.lakeStone('#7f8794'), rough: 0.9 })));
  // 灯打在幢身，字面才读得出凹凸
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ffcf94', 2.0));
  lamp.position.set(0.9, 1.4, 0.9);
  grp.add(lamp);
  grp.position.set(x, y, z);
  return grp;
}

/** 北宋金莲桥：两条石梁、端头雕螭首，栏板压一边 */
function lotusBridge({ z, span, width, y }) {
  const grp = new THREE.Group();
  const beams = [
    box(span, 0.5, width * 0.42, 0, y + 0.25, -width * 0.26),
    box(span, 0.5, width * 0.42, 0, y + 0.25, width * 0.26),
  ];
  const piers = [
    box(0.9, 1.5, width + 0.5, -span / 2 + 0.6, y - 0.7, 0),
    box(0.9, 1.5, width + 0.5, span / 2 - 0.6, y - 0.7, 0),
    box(0.7, 1.3, width + 0.4, 0, y - 0.6, 0),
  ];
  // 螭首：梁头探出的一截圆石
  const heads = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.34, 9, 7);
      g.scale(1.5, 0.7, 1);
      g.translate(sx * (span / 2 + 0.3), y + 0.3, sz * width * 0.26);
      heads.push(g);
    }
  }
  const rail = [];
  for (let i = 0; i <= 12; i++) {
    const px = -span / 2 + (span * i) / 12;
    for (const sz of [-1, 1]) {
      if (i % 3 === 0) rail.push(box(0.2, 0.66, 0.2, px, y + 0.83, sz * width / 2));
      rail.push(box(span / 12 + 0.04, 0.36, 0.14, px, y + 0.7, sz * (width / 2 - 0.06)));
    }
  }
  const stone = lit('#c2c8d4', { map: T.stone('#9fa6b2'), rough: 0.86, emissive: '#141a26', ei: 0.4 });
  grp.add(mesh(beams, stone));
  grp.add(mesh(piers, M.stoneDark));
  grp.add(mesh(heads, stone));
  grp.add(mesh(rail, M.stoneDressed));
  grp.position.set(AX, 0, z);
  return grp;
}

/** 香炉与长明灯：寺前那一点火 */
function altar(scene, x, z, y) {
  const grp = new THREE.Group();
  const body = [
    new THREE.CylinderGeometry(0.86, 0.6, 0.9, 12).translate(0, 1.35, 0),
    box(0.5, 0.5, 0.5, 0, 0.25, 0),
    new THREE.CylinderGeometry(1.0, 1.0, 0.16, 12).translate(0, 0.62, 0),
  ];
  for (const s of [-1, 1]) {
    body.push(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6).rotateZ(s * 0.5).translate(s * 0.95, 1.9, 0));
  }
  grp.add(mesh(body, lit('#7d6a52', { rough: 0.6, metal: 0.5, emissive: '#241705', ei: 0.6 })));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.34, 9, 7), glow('#ff9a3e', 2.4));
  flame.position.set(0, 1.9, 0);
  grp.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,150,70', 0.16), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.position.set(0, 1.95, 0);
  halo.scale.set(6, 6, 1);
  grp.add(halo);
  grp.position.set(x, y, z);
  scene.add(grp);
  return { group: grp, flame, halo };
}

export function buildTemple(scene, columns, reflections) {
  const root = new THREE.Group();
  root.name = 'temple';
  scene.add(root);
  const Y = TEMPLE.y;

  // 五级台地，最后一块 hole 给金莲池
  const bands = [
    { z0: 26, z1: -44, y: Y[0], x1: AX + 16 },
    { z0: -44, z1: -76, y: Y[1], hole: { cx: AX, cz: TEMPLE.lotus.z, hw: TEMPLE.lotus.hw, hd: TEMPLE.lotus.hd } },
    { z0: -76, z1: -108, y: Y[2] },
    { z0: -108, z1: -148, y: Y[3] },
    { z0: -148, z1: -196, y: Y[4] },
  ];
  for (const b of bands) {
    scene.add(groundPad({
      x0: AX - 30, x1: b.x1 ?? AX + 30, z0: b.z0, z1: b.z1, y: b.y, mat: M.stoneDressed,
    }));
  }
  // 台地之间的挡土立板 + 中间三步石阶
  const risers = [], stairs = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const z = bands[i].z1, dy = bands[i + 1].y - bands[i].y;
    risers.push(box(60, dy, 0.6, AX, bands[i].y - dy / 2, z));
    for (let k = 0; k < 4; k++) {
      stairs.push(box(6.2, dy / 4, 0.9, AX, bands[i].y - dy + (k + 0.5) * (dy / 4), z + 0.6 + k * 0.9));
    }
  }
  root.add(mesh(risers, M.stoneDark));
  root.add(mesh(stairs, M.stoneDressed));

  // 金莲池护栏（绕池一圈，避开桥口）
  const rail = [];
  const L = TEMPLE.lotus;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const px = AX - L.hw + 2 * L.hw * t;
    for (const sz of [-1, 1]) {
      if (Math.abs(px - AX) < L.hw * 0.2) continue;   // 桥让位
      rail.push(box(2 * L.hw / 24 + 0.05, 0.34, 0.14, px, Y[1] + 0.42, L.z + sz * (L.hd + 0.4)));
    }
  }
  root.add(mesh(rail, M.stoneDressed));
  root.add(lotusBridge({ z: L.z, span: TEMPLE.bridge.span, width: TEMPLE.bridge.width, y: Y[1] }));
  root.add(sutraPillar({ x: TEMPLE.pillar.x, z: TEMPLE.pillar.z, y: Y[0] }));

  // 一路三进 + 藏经楼，全部面朝山下（+Z）
  const defs = [
    { ...TEMPLE.gate, bays: 3, bayW: 4.6, depth: 4.4, y: Y[0] },
    { ...TEMPLE.hall1, bays: 3, bayW: 5.2, depth: TEMPLE.hall1.d, y: Y[2] },
    { ...TEMPLE.hall2, bays: 5, bayW: 4.4, depth: TEMPLE.hall2.d, y: Y[3], green: true },
    { ...TEMPLE.storey, bays: 3, bayW: 5.0, depth: TEMPLE.storey.d, y: Y[4] },
  ];
  const buildings = [];
  for (const d of defs) {
    const b = hall({
      bays: d.bays, bayW: d.bayW, depth: d.depth, h: d.h, groundY: d.y,
      name: d.name, green: !!d.green, plinth: 0.7,
    });
    b.group.position.set(AX, d.y, d.z);
    b.group.rotation.y = -Math.PI / 2;
    root.add(b.group);
    buildings.push(b.group);
  }

  // 竹炉山房与两侧配殿
  const zl = hall({ bays: 2, bayW: 4.0, depth: TEMPLE.zhulu.d, h: TEMPLE.zhulu.h, groundY: Y[2], name: '竹炉山房' });
  zl.group.position.set(TEMPLE.zhulu.x, Y[2], TEMPLE.zhulu.z);
  zl.group.rotation.y = -Math.PI / 2;
  root.add(zl.group);
  for (const s of [-1, 1]) {
    const side = hall({ bays: 3, bayW: 3.4, depth: 7.0, h: 4.2, groundY: Y[2], name: '' });
    side.group.position.set(AX + s * 22, Y[2], -96);
    side.group.rotation.y = s < 0 ? 0 : Math.PI;
    root.add(side.group);
    buildings.push(side.group);
  }

  // 院墙：只在山下两侧各封一段，其余靠山林收边
  root.add(wallRun({ from: [AX - 30, -8], to: [AX - 30, -76], groundY: Y[0], h: 3.2 }).group);
  root.add(wallRun({ from: [AX + 30, -8], to: [AX + 30, -76], groundY: Y[0], h: 3.2 }).group);

  // 树：古银杏在山门两侧与配殿后
  const cypressSpots = TEMPLE.ginkgo.map(([x, z]) => [x, z]);
  cypress(scene, cypressSpots, Y[1]);
  const ginkgo = [];
  for (const [x, z] of TEMPLE.ginkgo) {
    const h = rr(12, 17);
    const trunk = new THREE.CylinderGeometry(0.3, 0.55, h, 7);
    trunk.translate(x, Y[1] + h / 2, z);
    ginkgo.push(trunk);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.IcosahedronGeometry(rr(1.8, 3.2), 0);
      b.translate(x + rr(-2.4, 2.4), Y[1] + h * rr(0.66, 1.02), z + rr(-2.4, 2.4));
      ginkgo.push(b);
    }
  }
  root.add(mesh(ginkgo, lit('#2f4a3a', { rough: 0.95, emissive: '#0d1a12', ei: 0.5 })));

  // 灯火：檐前一律、香炉一簇、池心一点月
  const spots = [];
  for (const d of defs) {
    for (let i = 0; i < 4; i++) {
      spots.push([AX + 2.2, d.y + d.h * 0.72, d.z - d.w / 2 + 1.4 + (i * (d.w - 2.8)) / 3]);
    }
  }
  const lanterns = lanternCluster(scene, spots, { scale: 0.9, halo: 3.4 });

  columns.add(new THREE.Vector3(AX, 0, TEMPLE.lotus.z - 2), '#ffcf94', 2.2, 6.5, 0.5, TEMPLE.lotus.y);
  const moon = moonInPool(scene, { x: AX + 2.6, z: TEMPLE.lotus.z + 1.4, y: TEMPLE.lotus.y + 0.03, size: 0.85 });
  const altar1 = altar(scene, AX, -30, Y[0]);
  const altar2 = altar(scene, AX, -114, Y[3]);

  // 金莲池离轴线还有一段，整组镜像会把山门翻到台面之上变成鬼影，这里不做寺院的倒影
  void reflections;

  return {
    root,
    buildings,
    lanterns,
    altars: [altar1, altar2],
    moon,
    update(t, lantern) {
      lanterns.visible = lantern > 0.02;
      for (const a of [altar1, altar2]) {
        const k = 1 + 0.18 * Math.sin(t * 6.2 + a.group.position.z);
        a.flame.scale.setScalar(k);
        a.halo.scale.set(6 * k, 6 * k, 1);
      }
      moon.disc.scale.setScalar(0.9 + 0.1 * Math.sin(t * 0.7));
    },
  };
}

export { sutraPillar, lotusBridge };
