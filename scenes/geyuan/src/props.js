import * as THREE from 'three';
import { M, PAL, glow, lit, rr, ri, rand, bambooClump, lanternMesh, stoneLamp, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { SITE, GARDEN, HOUSE, clearOfStations } from './data.js';

/**
 * 灯火、竹与竹影、雪意——园里所有"软"的东西都在这一档。
 * 竹是园名的来处，所以竹分两层：实体的竹丛，和打在粉墙上的竹影。
 */

const WZ1 = SITE.wall.z1, WZ0 = SITE.wall.z0, WX1 = SITE.wall.x1, WX0 = SITE.wall.x0;

/** 竹丛落位：贴墙一线与四山之间，中部水池里不下竹 */
const BAMBOO = [
  [4, 25.6, 12, 5.2], [10, 26, 11, 5.6], [18, 26.2, 10, 5.4], [25, 26, 12, 5.6], [31, 25.4, 10, 5.0],
  [36, 21, 9, 4.6], [40, 16, 8, 4.4], [44, 22, 9, 4.8], [34, 12, 7, 4.2], [40, 8, 8, 4.6],
  [-47, 22, 9, 4.8], [-44, 14, 8, 4.4], [-46, 6, 7, 4.2], [-47, -4, 9, 4.8], [-45, -14, 8, 4.4], [-46, -24, 7, 4.2],
  [48, 12, 8, 4.6], [48, 0, 9, 4.8], [48, -16, 7, 4.2], [50, -26, 6, 4.0],
  [-37, 14.5, 7, 4.0], [-28, 14.5, 6, 3.8], [-24, -20, 6, 3.8], [-30, -30, 7, 4.2],
  [-14, -20, 5, 3.6], [2, -18, 6, 4.0], [12, -22, 5, 3.6], [34, -20, 7, 4.4], [38, -12, 6, 4.0],
  [22, 8, 6, 4.2], [26, 14, 5, 3.8], [16, 4, 4, 3.4], [-8, 20, 6, 4.0],
  [-2, 26, 5, 3.6], [0, -40, 5, 3.6], [-16, -40, 6, 4.0], [16, -40, 5, 3.6],
  [HOUSE.east.x - 5, HOUSE.east.z - 8, 5, 3.8], [HOUSE.west.x, HOUSE.west.z - 12, 8, 4.4],
  [HOUSE.west.x + 6, HOUSE.west.z - 16, 6, 3.8], [HOUSE.lane.wallIn + 0.8, HOUSE.lane.zFrom + 5, 3, 3.2],
];

/** 石灯落位：只放在铺地的园路上，不站进水里 */
const STONE_LAMPS = [
  [-4, 26.5], [-4, 18], [6, 17], [16, 17], [-11, 17],
  [-20, 10], [-20, -4], [-20, -16], [-12, -13], [2, -13],
  [-6, -33], [-6, -22], [-14, -30], [6, -30], [16, -30],
  [34, -16], [34, -4], [28, 10], [22, 16], [44, 4],
  [0, 86], [0, 74], [0, 58], [0, 42],
  [HOUSE.lane.wallIn + 0.85, 44], [HOUSE.lane.wallIn + 0.85, 66],
  [HOUSE.east.x - 8, HOUSE.east.z + 6], [HOUSE.west.x + 8, HOUSE.west.z + 6],
];

export function buildProps(scene, q) {
  const grp = new THREE.Group();
  grp.name = 'ge-props';

  /* ---------------------------------------------------------------- 竹 */
  const bamboo = new THREE.Group();
  bamboo.name = 'bamboo';
  for (const [x, z, count, height] of BAMBOO) {
    if (!clearOfStations(x, z, 6)) continue;
    const c = bambooClump({ count, height, radius: rr(0.9, 1.5) });
    c.position.set(x, 0, z);
    bamboo.add(c);
  }
  // 北部万竹园（旧称君子林，1998 年恢复）：园墙之外一片品种竹，密到看不出缝
  const W = SITE.wanzhu;
  for (let gx = W.x0; gx <= W.x1; gx += 5.5) {
    for (let gz = W.z0; gz <= W.z1; gz += 5) {
      const c = bambooClump({ count: ri(9, 14), height: rr(4.6, 6.4), radius: rr(1.4, 2.2) });
      c.position.set(gx + rr(-2, 2), 0, gz + rr(-1.6, 1.6));
      bamboo.add(c);
    }
  }
  grp.add(bamboo);

  /* ---------------------------------------------------------- 粉墙竹影 */
  const shadowMat = () => new THREE.MeshBasicMaterial({
    map: T.bambooShadow().clone(), transparent: true, opacity: 0.42,
    color: new THREE.Color('#3d4a5c'), depthWrite: false, fog: true,
  });
  const shadows = [];
  // 竹影只贴白墙最完整的段落：南湖墙的音洞与梅花窗不能被它糊住
  const shadowDefs = [
    { w: 26, h: 1.5, pos: [20, 3.85, WZ1 - SITE.wall.t / 2 - 0.05], rot: Math.PI },
    { w: 13, h: 3.8, pos: [-12, 2.0, WZ1 - SITE.wall.t / 2 - 0.05], rot: Math.PI },
    { w: 24, h: 4.0, pos: [WX1 - SITE.wall.t / 2 - 0.05, 2.1, 2], rot: -Math.PI / 2 },
    { w: 26, h: 4.0, pos: [WX0 + SITE.wall.t / 2 + 0.05, 2.1, -8], rot: Math.PI / 2 },
  ];
  for (const d of shadowDefs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), shadowMat());
    m.position.set(...d.pos);
    m.rotation.y = d.rot;
    m.material.toneMapped = false;
    registerOccluder(m, 2.4, m.position.clone());
    grp.add(m);
    shadows.push(m);
  }

  /* ------------------------------------------------------------ 灯具 */
  const lamps = [];
  const addLantern = (x, y, z, color = PAL.lanternWarm, size = 0.34) => {
    const l = lanternMesh({ size, color });
    l.position.set(x, y, z);
    grp.add(l);
    lamps.push(l);
    return l;
  };
  // 长廊下每开间悬一盏
  for (const list of [q.anchors.corridorWest, q.anchors.corridorEast]) {
    for (const [x, y, z] of list) addLantern(x, y + 0.1, z, PAL.lanternWarm, 0.25);
  }
  // 厅堂檐下
  const eaves = [
    [GARDEN.yuxuan.x, 4.5, GARDEN.yuxuan.z + GARDEN.yuxuan.d / 2 + 1.1, 2],
    [GARDEN.louyue.x, 4.1, GARDEN.louyue.z + GARDEN.louyue.d / 2 + 1, 2],
    [GARDEN.congshu.x, 3.7, GARDEN.congshu.z + GARDEN.congshu.d / 2 + 1, 2],
    [GARDEN.baoshan.x, 7.2, GARDEN.baoshan.z + GARDEN.baoshan.d / 2 + 1.2, 4],
    [0, 4.4, HOUSE.axis.ting.z + HOUSE.axis.ting.d / 2 + 1.2, 3],
    [0, 3.9, HOUSE.axis.men.z + HOUSE.axis.men.d / 2 + 1, 2],
    [HOUSE.east.x, 4.0, HOUSE.east.z + HOUSE.east.d / 2 + 1, 2],
    [HOUSE.west.x, 4.2, HOUSE.west.z + HOUSE.west.d / 2 + 1, 2],
  ];
  for (const [x, y, z, n] of eaves) {
    for (let i = 0; i < n; i++) {
      let off = (i - (n - 1) / 2) * 3.0;
      // 正中的一盏会压在门匾上，挪开
      if (Math.abs(off) < 1.2) off += 1.8;
      addLantern(x + off, y, z, PAL.lanternWarm, 0.26);
    }
  }
  // 园门与巷门：门灯两盏，红色的是园子的脸面
  addLantern(GARDEN.gate.x - 1.9, 2.9, WZ1 - 0.6, PAL.lanternRed, 0.3);
  addLantern(GARDEN.gate.x + 1.9, 2.9, WZ1 - 0.6, PAL.lanternRed, 0.3);
  addLantern(HOUSE.lane.x - 1.3, 2.8, HOUSE.lane.zFrom + 0.9, PAL.lanternRed, 0.32);
  addLantern(HOUSE.lane.x + 1.3, 2.8, HOUSE.lane.zFrom + 0.9, PAL.lanternRed, 0.32);

  const stoneLamps = [];
  for (const [x, z] of STONE_LAMPS) {
    if (!clearOfStations(x, z, 9.5)) continue;
    const s = stoneLamp({ h: rr(1.3, 1.7) });
    s.position.set(x, 0, z);
    grp.add(s);
    stoneLamps.push(s);
    lamps.push(s);
  }

  /* ------------------------------------------------------- 缸、桌凳、杂花 */
  for (const [x, z] of [
    [GARDEN.yuxuan.x - 8, GARDEN.yuxuan.z + 4], [GARDEN.yuxuan.x + 8, GARDEN.yuxuan.z + 4],
    [GARDEN.louyue.x - 7, GARDEN.louyue.z + 2], [GARDEN.congshu.x + 6.5, GARDEN.congshu.z + 3],
  ].filter(([x, z]) => clearOfStations(x, z, 6))) {
    const vat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.6, 0.8, 14, 1, true), M.stoneDressed);
    body.position.y = 0.4;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 5, 16), M.stone);
    rim.rotateX(Math.PI / 2); rim.position.y = 0.8;
    const surf = new THREE.Mesh(new THREE.CircleGeometry(0.66, 16),
      lit(PAL.water, { rough: 0.1, metal: 0.4, emissive: '#0c1622', ei: 0.6 }));
    surf.rotateX(-Math.PI / 2); surf.position.y = 0.72;
    vat.add(body, rim, surf);
    vat.position.set(x, 0, z);
    grp.add(vat);
  }
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.12, 14), M.stoneDressed);
  top.position.y = 0.74;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.74, 8), M.stone);
  leg.position.y = 0.37;
  table.add(top, leg);
  for (const s of [-1, 1]) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.4, 10), M.stone);
    stool.position.set(s * 1.3, 0.2, 0.2);
    table.add(stool);
  }
  table.position.set(31, 0, 19);
  table.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  grp.add(table);

  // 秋山的南天竹与牡丹、春山的老梅桩
  const under = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const a = rr(0, Math.PI * 2), rad = Math.sqrt(rand());
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.3, 0.6), 0),
      lit(i % 3 === 0 ? '#7a3040' : '#3c5c40', { rough: 0.95, side: THREE.DoubleSide }));
    bush.position.set(
      GARDEN.autumn.cx + Math.cos(a) * GARDEN.autumn.w * 0.42 * rad,
      rr(0.2, 1.4),
      GARDEN.autumn.cz + Math.sin(a) * GARDEN.autumn.d * 0.4 * rad);
    bush.scale.y = 0.7;
    under.add(bush);
  }
  for (let i = 0; i < 14; i++) {
    const peony = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), glow('#e8a8c8', 0.6));
    peony.position.set(
      GARDEN.autumn.cx + rr(-9, 9), rr(0.4, 1.2), GARDEN.autumn.cz + rr(-6, 7));
    under.add(peony);
  }
  grp.add(under);

  /* ------------------------------------------------------------- 雪意 */
  const snow = new THREE.Mesh(new THREE.PlaneGeometry(GARDEN.winter.w + 10, GARDEN.winter.d + 9),
    new THREE.MeshBasicMaterial({
      map: T.snowCover(), transparent: true, opacity: 0.62,
      color: new THREE.Color('#d6e4f6'), depthWrite: false,
    }));
  snow.rotation.x = -Math.PI / 2;
  snow.position.set(GARDEN.winter.cx, 0.07, GARDEN.winter.cz);
  snow.name = 'snow';
  grp.add(snow);

  grp.traverse((o) => {
    if (o.isMesh) { o.castShadow = o.geometry.type !== 'PlaneGeometry'; }
  });
  scene.add(grp);

  return {
    group: grp, bamboo, lamps, stoneLamps, shadows, snow,
    setLantern(k) {
      const n = Math.round(lamps.length * Math.min(1.4, Math.max(0, k)));
      lamps.forEach((l, i) => { l.visible = i < n; });
    },
    setBambooShadow(k) {
      shadows.forEach((s) => { s.material.opacity = 0.52 * Math.min(1.6, Math.max(0, k)); });
    },
    setSnow(v) { snow.visible = !!v; },
    setWindow(k) {
      M.lattice.color.setScalar(0.24 + 0.3 * Math.min(1.6, k));
      M.latticeBlue.color.setScalar(0.24 + 0.3 * Math.min(1.6, k));
    },
    update(t, wind) {
      // 竹影随风移位：贴图偏移一点点，粉墙上的竹子就活了
      shadows.forEach((s, i) => {
        const m = s.material.map;
        m.offset.x = wind ? Math.sin(t * 0.13 + i) * 0.018 : 0;
        m.offset.y = wind ? Math.cos(t * 0.09 + i * 1.7) * 0.006 : 0;
      });
      bamboo.rotation.y = wind ? Math.sin(t * 0.18) * 0.0025 : 0;
      for (let i = 0; i < lamps.length; i += 3) {
        const l = lamps[i];
        if (!l.visible || !l.userData.lamp) continue;
        const { halo } = l.userData.lamp;
        // 吊灯的 halo 是网格、石灯的是精灵，初始尺度不同，各自记住自己的基准
        if (halo.userData.base === undefined) halo.userData.base = halo.scale.x;
        halo.scale.setScalar(halo.userData.base * (1 + 0.09 * Math.sin(t * 1.4 + i)));
      }
    },
  };
}
