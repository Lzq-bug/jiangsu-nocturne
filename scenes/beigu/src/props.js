import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, glow, rand, rr, box } from './kit.js';
import * as T from './textures.js';
import {
  terrainHeight, southBank, SITES, TOP, RIVER, BAY, CITY, FAR, PLAIN, WATCH,
} from './data.js';

/**
 * 灯。镇江的北固山是白天开的景区，"夜登北固山看江"没有可考的常设节目，
 * 所以这一整幅夜景是画出来的：发光面一律 MeshBasicMaterial 喂 bloom，
 * 真灯（PointLight）全场景压在十来盏以内。
 *
 * 招牌动作「北望神州」把灯分九段（data.js 的 WATCH），v 从 0 推到 1，
 * 山门—寺—题刻—铁塔—多景楼—江滩—船—远山—北固楼与江北，一段一段起来。
 */

export function buildProps(scene, arch, mountain, river, columns) {
  const group = new THREE.Group();
  group.name = 'props';
  const built = arch.built;
  const waterLamps = [];
  const haloList = [];            // [x,y,z,阈值 hue]
  const groups = {};              // key -> {items:[{x,y,z,s}], mesh, mat}

  const push = (key, x, y, z, s = 1, hue = '255,198,132', t = null) => {
    const g = groups[key] || (groups[key] = { items: [] });
    g.items.push({ x, y, z, s });
    const th = t === null ? (WATCH.find((w) => w.key === key)?.t ?? 1) : t;
    haloList.push([x, y, z, th, hue]);
  };

  /* ------------------------------------------------------------ 建筑上挂的灯 */
  for (const L of arch.lamps) {
    push(L.g || 'temple', L.x, L.y, L.z, L.kind === 'flood' ? 1.5 : 1, L.kind === 'uplight' ? '215,230,255' : '255,198,132', L.t);
  }

  /* ------------------------------------------------------------ 檐下灯笼 */
  const paper = [], caps = [], strings = [];
  const eaves = [
    ...templeEaves(built.temple), ...loftEaves(built.beiguLou), ...loftEaves(built.duoJing, 0.7),
  ];
  for (const e of eaves) {
    const drop = rr(0.5, 0.8), r = rr(0.24, 0.32);
    const y = e.y - drop;
    strings.push(new THREE.CylinderGeometry(0.018, 0.018, drop, 4).translate(e.x, e.y - drop / 2, e.z));
    paper.push(new THREE.SphereGeometry(0.5, 12, 9).scale(r * 1.7, r * 2.4, r * 1.7).translate(e.x, y - r * 0.55, e.z));
    caps.push(box(r * 0.6, 0.09, r * 0.6, e.x, y, e.z));
    caps.push(box(r * 0.5, 0.08, r * 0.5, e.x, y - r * 1.2 - 0.02, e.z));
    push('temple', e.x, y - r * 0.55, e.z, 0.8, '255,205,145', e.t);
  }
  if (paper.length) {
    const pm = mesh(mergeGeometries(paper), M.lantern);
    pm.name = 'lantern-paper';
    group.add(pm);
    group.add(mesh(mergeGeometries(caps), M.timberDark));
    group.add(mesh(mergeGeometries(strings), M.dark));
  }

  /* ------------------------------------------------------------ 上山石灯 */
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const x = TOP.x + SITES.gate.dx * (1 - t) + Math.sin(t * 3.1) * 26 + (i % 2 ? 2.6 : -2.6);
    const z = TOP.z + (SITES.gate.dz + 34) * (1 - t);
    const y = terrainHeight(x, z);
    if (y < PLAIN - 1) continue;
    const h = rr(0.95, 1.25);
    const stone = [
      box(0.46, 0.16, 0.46, x, y, z),
      new THREE.CylinderGeometry(0.1, 0.12, h, 7).translate(x, y + h / 2 + 0.16, z),
      box(0.5, 0.38, 0.5, x, y + h + 0.16, z),
      box(0.66, 0.1, 0.66, x, y + h + 0.54, z),
    ];
    group.add(mesh(stone, M.stone));
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), glow('#ffcb92', 1.0));
    core.position.set(x, y + h + 0.33, z);
    core.userData.group = 'gate';
    group.add(core);
    push('gate', x, y + h + 0.42, z, 0.8, '255,200,140');
  }

  /* ------------------------------------------------------ 北固湾栈道 汉阙灯 */
  const posts = [];
  const line = BAY.line;
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, z0] = line[i], [x1, z1] = line[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / BAY.lampsEvery));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const y = BAY.deckY;
      // 汉阙：一小段阙身加一个斗，灯在斗下
      posts.push(box(0.5, 0.3, 0.5, x, y, z));
      posts.push(box(0.62, 1.9, 0.42, x, y + 0.3, z));
      posts.push(box(1.1, 0.22, 0.8, x, y + 2.2, z));
      posts.push(box(0.86, 0.18, 0.62, x, y + 2.42, z));
      push('quay', x, y + 2.1, z, 0.9, '255,206,150');
      waterLamps.push([x, z]);
    }
    acc += len;
  }
  group.add(mesh(posts, M.cement));
  // 栈道铺地与栏杆
  const walk = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, z0] = line[i], [x1, z1] = line[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const seg = new THREE.BoxGeometry(len + 2, 0.24, 7.2);
    seg.rotateY(rot);
    seg.translate((x0 + x1) / 2, BAY.deckY - 0.3, (z0 + z1) / 2);
    walk.push(seg);
    for (const side of [-1, 1]) {
      const rail = new THREE.BoxGeometry(len, 0.9, 0.18);
      rail.rotateY(rot);
      rail.translate((x0 + x1) / 2 + Math.cos(rot + Math.PI / 2) * side * 3.4,
        BAY.deckY + 0.3, (z0 + z1) / 2 + Math.sin(rot + Math.PI / 2) * side * 3.4);
      walk.push(rail);
    }
  }
  group.add(mesh(walk, M.timber));

  /* ------------------------------------------------------------ 广场与港区 */
  const q = RIVER.quay;
  for (let i = 0; i < 12; i++) {
    const x = q.x0 + (i / 11) * (q.x1 - q.x0);
    const z = q.z0 + ((i * 7) % 5) * 12;
    push('quay', x, 6.5 + rr(0, 6), z, 1.1, '255,190,150');
    group.add(mesh([box(0.6, 8 + rr(0, 7), 0.6, x, southBank(x) * 0 + PLAIN - 1, z)], M.steel));
  }

  /* -------------------------------------------------------------- 江上船灯 */
  const ships = [];
  for (let i = 0; i < 6; i++) {
    const x = RIVER.xWest + 400 + i * 640 + rr(-120, 120);
    const z = RIVER.channel + rr(-260, 260);
    const dir = i % 2 ? 1 : -1;
    const speed = rr(7.5, 13) * dir;
    const hull = [
      box(14, 1.5, 4.2, 0, 0.2, 0),
      box(5, 2.4, 3.4, -2.4, 1.7, 0),
    ];
    const m = mesh(hull, M.dark);
    m.position.set(x, 0, z);
    m.rotation.y = dir > 0 ? 0 : Math.PI;
    m.name = `ship-${i}`;
    group.add(m);
    const lampIdx = [];
    for (const [lx, ly, lz] of [[-2.2, 4.3, 0], [4.2, 2.6, 0], [-6.2, 2.2, 0]]) {
      lampIdx.push(columns.add(new THREE.Vector3(x + lx, 0, z + lz), '#ffc48c', 1.5, 16, 1));
    }
    ships.push({ mesh: m, x, z, speed, lampIdx, t: 0.76 });
  }

  /* ------------------------------------------------------------ 江北与远山 */
  const far = [];
  for (let i = 0; i < FAR.yizhou.towers; i++) {
    const x = FAR.yizhou.x0 + (i + 0.5) * ((FAR.yizhou.x1 - FAR.yizhou.x0) / FAR.yizhou.towers);
    const h = 10 + ((i * 37) % FAR.yizhou.hMax);
    far.push(box(16 + (i % 3) * 8, h, 14, x, -0.5, -2380 - (i % 4) * 40));
  }
  const farMesh = mesh(far, M.silhouette);
  farMesh.name = 'yizhou-bank';
  group.add(farMesh);
  for (let i = 0; i < 34; i++) {
    const x = FAR.yizhou.x0 + rr(0, FAR.yizhou.x1 - FAR.yizhou.x0);
    push('far', x, rr(1.5, 16), -2330 - rr(0, 120), 1.1, '198,214,236');
  }
  // 金山与焦山：几条压在水面上的黑脊 + 一点塔灯
  push('far', FAR.jinshan.x, FAR.jinshan.h + 34, FAR.jinshan.z, 1.3, '255,206,150');
  push('far', FAR.jiaoshan.x, FAR.jiaoshan.h + 26, FAR.jiaoshan.z, 1.3, '255,206,150');
  // 润扬大桥：两座主塔与一串吊索灯
  const br = FAR.bridge;
  for (const z of [br.zFrom, br.zTo]) {
    push('far', br.x, br.towerH, z, 1.4, '210,226,248');
    group.add(mesh([box(4.6, br.towerH, 4.6, br.x, -1, z)], M.silhouette));
  }
  const deck = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const z = br.zFrom + (br.zTo - br.zFrom) * t;
    const sagY = 22 - br.sag * 0.5 * Math.sin(t * Math.PI) * 0.2;
    deck.push(box(5.2, 0.9, Math.abs(br.zTo - br.zFrom) / 16 + 1, br.x, sagY, z));
    if (i % 2 === 0) push('far', br.x, sagY + 2.4, z, 0.9, '205,222,244');
  }
  group.add(mesh(deck, M.silhouette));

  /* ------------------------------------------------------------ 今市 */
  const city = buildCity();
  group.add(city.grp);
  for (const [x, z] of city.lampSpots) push('far', x, terrainHeight(x, z) + rr(6, 20), z, 1.0, '255,196,146');

  /* ------------------------------------------------- 每组的发光芯（一次 draw call） */
  const coreGeo = new THREE.SphereGeometry(0.26, 8, 6);
  const coreMeshes = [];
  const dummy = new THREE.Object3D();
  for (const key of Object.keys(groups)) {
    const g = groups[key];
    const mat = glow('#ffd09a', 1.05);
    mat.transparent = true;
    const im = new THREE.InstancedMesh(coreGeo, mat, g.items.length);
    im.name = `lamp-core-${key}`;
    im.frustumCulled = false;
    im.renderOrder = 5;
    g.items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      const s = it.s;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
    coreMeshes.push({ key, im, mat, items: g.items });
    g.mesh = im;
  }

  /* ---------------------------------------------------- 所有火光的晕（点云） */
  group.add(haloPoints(haloList));

  /* -------------------------------------------------------- 十来盏真灯 */
  const L = [
    { p: [SITES.temple.x, built.temple.floorY + 4.6, SITES.temple.z + 4], c: 0xffb06a, i: 330, d: 30, g: 'temple' },
    { p: [SITES.temple.x, built.temple.floorY + 6.2, SITES.temple.z - 26], c: 0xffbb7d, i: 260, d: 26, g: 'gate' },
    { p: [built.beiguLou.center[0], built.beiguLou.floorY + 3.2, built.beiguLou.center[1]], c: 0xffc48a, i: 300, d: 26, g: 'lou' },
    { p: [built.beiguLou.center[0], built.beiguLou.baseY + 3.0, built.beiguLou.center[1] - 12], c: 0xffbe84, i: 420, d: 34, g: 'lou' },
    { p: [SITES.duoJing.x, built.duoJing.deck + 2.4, SITES.duoJing.z - 8], c: 0xffc48a, i: 210, d: 22, g: 'duojing' },
    { p: [SITES.steleWall.x - 6, SITES.steleWall.y + 1.4, SITES.steleWall.z - 4], c: 0xdfe8f2, i: 190, d: 18, g: 'stele' },
    { p: [SITES.steleWall.x + 6, SITES.steleWall.y + 1.4, SITES.steleWall.z - 4], c: 0xdfe8f2, i: 190, d: 18, g: 'stele' },
    { p: [SITES.ironTower.x + 3.4, SITES.ironTower.y + 1.6, SITES.ironTower.z + 5.2], c: 0xe6f0ff, i: 240, d: 20, g: 'tower' },
    { p: [SITES.jiangTing.x, SITES.jiangTing.floorY + 2.2, SITES.jiangTing.z], c: 0xffcf9a, i: 150, d: 16, g: 'temple' },
    { p: [SITES.henStone.x, SITES.henStone.y + 2.0, SITES.henStone.z + 3.2], c: 0xffd9a8, i: 120, d: 12, g: 'temple' },
    { p: [BAY.line[3][0], BAY.deckY + 3.2, BAY.line[3][1]], c: 0xffc98f, i: 330, d: 30, g: 'quay' },
    { p: [BAY.line[1][0], BAY.deckY + 3.0, BAY.line[1][1]], c: 0xffc98f, i: 260, d: 26, g: 'quay' },
    { p: [built.gate.floorY + 4.6, 0, 0].map((v, i) => (i === 1 ? built.gate.floorY + 4.6 : v)), c: 0, i: 0, d: 0, g: null },
  ].filter((l) => l.g);
  L[L.length - 1] = {
    p: [SITES.gate.x, built.gate.floorY + 5.2, SITES.gate.z], c: 0xffbb7d, i: 300, d: 28, g: 'gate',
  };
  const lights = [];
  for (const l of L) {
    const pl = new THREE.PointLight(l.c, l.i, l.d, 2);
    pl.position.set(l.p[0], l.p[1], l.p[2]);
    pl.userData.base = l.i;
    pl.userData.group = l.g;
    scene.add(pl);
    lights.push(pl);
  }

  scene.add(group);

  /* -------------------------------------------------------------- 状态 */
  let reveal = 1, lampBright = 1, tier = 0.4, tide = 1;
  const thMap = {};
  for (const w of WATCH) thMap[w.key] = w.t;

  const writeCores = () => {
    const c = new THREE.Color();
    for (const { key, mat, items } of coreMeshes) {
      const on = reveal >= (thMap[key] ?? 1) - 0.001;
      const k = (on ? 1 : 0.035) * lampBright;
      mat.color.setRGB(1.0 * k, 0.78 * k, 0.5 * k);
      mat.opacity = on ? 1 : 0.05;
      if (items.length === 0) im_hidden(key);
    }
  };
  const im_hidden = () => {};
  writeCores();

  return {
    group,
    waterLamps,
    lights,
    ships,
    cityWindows: city.windows,
    /** 北望神州：v=0 全黑，v=1 一路点到江北；snap 直接落位 */
    setWatch(v, { snap = false } = {}) {
      reveal = Math.min(1, Math.max(0, v));
      if (river) river.setBand(Math.max(0, (reveal - 0.6) / 0.4));
      writeCores();
      const hp = group.getObjectByName('lamp-halos');
      if (hp) hp.material.uniforms.uReveal.value = reveal;
      for (const pl of lights) {
        const on = reveal >= (thMap[pl.userData.group] ?? 1) - 0.001;
        pl.userData.on = on;
        pl.visible = on;
      }
      for (const s of ships) s.mesh.visible = reveal >= s.t;
      if (snap) { /* 静帧：序列直接落到终态，呼吸项也由调用方推 */ }
    },
    setLamp(v) {
      lampBright = v;
      M.lantern.emissiveIntensity = 0.55 * v;
      writeCores();
    },
    /** 铁塔逐层：0..1，四层各在 0.25/0.5/0.75/1.0 起 */
    setTier(v) {
      tier = v;
      for (const p of built.ironTower.glows) {
        const on = v * 4 > p.userData.level;
        p.material = p.material.userData?.shared ? p.material : p.material;
        p.visible = on;
      }
    },
    setTierRaw(v) { this.setTier(v); },
    get reveal() { return reveal; },
    update(t, dt) {
      const flick = 0.94 + 0.06 * Math.sin(t * 5.3) * Math.sin(t * 1.7 + 0.4);
      for (const pl of lights) {
        if (!pl.visible) continue;
        pl.intensity = pl.userData.base * flick * lampBright;
      }
      const hp = group.getObjectByName('lamp-halos');
      if (hp) {
        hp.material.uniforms.uTime.value = t;
        hp.material.uniforms.uBright.value = lampBright * flick;
      }
      // 船顺江走，灯柱跟着船
      for (const s of ships) {
        if (!s.mesh.visible) continue;
        s.x += s.speed * dt;
        if (s.x > RIVER.xEast - 200) s.x = RIVER.xWest + 300;
        if (s.x < RIVER.xWest + 300) s.x = RIVER.xEast - 200;
        s.mesh.position.x = s.x;
        const off = [[-2.2, 0], [4.2, 0], [-6.2, 0]];
        s.lampIdx.forEach((ci, k) => {
          if (ci < 0) return;
          columns.items[ci].pos.set(s.x + (s.speed > 0 ? off[k][0] : -off[k][0]), 0, s.z);
          columns.setOn(ci, reveal >= s.t);
        });
        columns.matrixDirty = true;
      }
    },
  };
}

/* ------------------------------------------------------------------ 辅助 */

/** 寺檐下的挂灯点 */
function templeEaves(t) {
  const out = [];
  const c = t.center;
  for (const [dx, dz, lv] of [[-9, -8, 6.4], [9, -8, 6.4], [-11, 12, 7.6], [11, 12, 7.6], [0, 26, 5.0]]) {
    out.push({ x: c[0] + dx, y: t.floorY + lv, z: c[1] + dz, t: 0.2 });
  }
  return out;
}

/** 楼的挂灯点（沿四角） */
function loftEaves(b, scale = 1) {
  const out = [];
  const [cx, cz] = b.center || [0, 0];
  for (const [dx, dz] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) {
    out.push({ x: cx + dx * scale, y: (b.floorY || b.deck) + 2.4, z: cz + dz * scale, t: 0.52 });
  }
  return out;
}

function buildCity() {
  const grp = new THREE.Group();
  grp.name = 'city';
  const bodies = [], windows = [], lampSpots = [];
  const FACADE = T.cityFacade();
  const CITY_M = glow;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#141a22'), map: FACADE, emissiveMap: FACADE,
    emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.62, roughness: 0.88,
  });
  for (const b of CITY.blocks) {
    const count = Math.round(((b.x1 - b.x0) * (b.z1 - b.z0)) / 5200);
    for (let i = 0; i < count; i++) {
      const x = b.x0 + rand() * (b.x1 - b.x0);
      const z = b.z0 + rand() * (b.z1 - b.z0);
      const y = Math.max(PLAIN, terrainHeight(x, z) - 0.5);
      const w = rr(9, 24), d = rr(8, 20), h = rr(b.h[0], b.h[1]);
      bodies.push(box(w, h, d, x, y - 0.4, z));
      if (rand() > 0.72) {
        const cols = Math.max(1, Math.round(w / 3.6));
        const lvl = Math.max(1, Math.round(h / 3.2));
        for (let ci = 0; ci < cols; ci++) {
          for (let li = 0; li < lvl; li++) {
            if (rand() > 0.2) continue;
            windows.push(box(0.9, 0.9, 0.14, x - w / 2 + (ci + 0.5) * (w / cols), y + 1.6 + li * 3.2, z + d / 2 + 0.03));
          }
        }
      }
      if (rand() > 0.9) lampSpots.push([x, z]);
    }
  }
  for (const tw of CITY.towers) {
    const y = Math.max(PLAIN, terrainHeight(tw.x, tw.z) - 0.5);
    bodies.push(box(20, tw.h, 20, tw.x, y - 0.5, tw.z));
    bodies.push(box(8, 4.5, 8, tw.x, y - 0.5 + tw.h, tw.z));
    for (let k = 0; k < 8; k++) {
      windows.push(box(13, 0.7, 0.16, tw.x, y + 4 + k * (tw.h / 9), tw.z + 10.1));
    }
    lampSpots.push([tw.x, tw.z]);
  }
  const bm = mesh(mergeGeometries(bodies), mat);
  bm.name = 'city-bodies';
  grp.add(bm);
  const wm = mesh(mergeGeometries(windows.length ? windows : [box(0.1, 0.1, 0.1, 0, -999, 0)]), CITY_M('#ffbe82', 0.42));
  wm.name = 'city-windows';
  grp.add(wm);
  return { grp, windows: wm, lampSpots };
}

/** 所有火光的晕：一次 draw call 的点云，每点带自己的阈值，uReveal 推到哪里亮到哪里 */
function haloPoints(list) {
  const n = list.length;
  const pos = new Float32Array(n * 3);
  const th = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  list.forEach((p, i) => {
    pos.set([p[0], p[1], p[2]], i * 3);
    th[i] = p[3];
    c.setRGB(...(p[4] || '255,198,132').split(',').map((v) => Number(v) / 255));
    col.set([c.r, c.g, c.b], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(th, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uBright: { value: 1 }, uReveal: { value: 1 },
      uTex: { value: T.softGlow('255,205,150', 0.1) },
    },
    vertexShader: `
      attribute float aT; attribute vec3 color;
      uniform float uReveal, uTime; varying vec3 vC; varying float vA;
      void main(){
        float on = smoothstep(aT, aT + 0.05, uReveal);
        float ph = position.x * 0.17 + position.z * 0.13;
        vA = on * (0.86 + 0.14 * sin(uTime * 2.2 + ph));
        vC = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(320.0 / max(9.0, -mv.z), 3.0, 58.0) * (0.6 + 0.5 * vA);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform float uBright;
      varying vec3 vC; varying float vA;
      void main(){
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vC, t.a * 0.3 * vA * uBright);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.name = 'lamp-halos';
  p.renderOrder = 6;
  return p;
}
