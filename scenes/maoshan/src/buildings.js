/**
 * 建筑：台地勒脚 + 殿宇牌楼 + 碑与纪念馆。
 *
 * 墙色按可考的口径分开：印宫一系"灰墙黛瓦、墙体黛青"，山门与红庙（崇禧万寿宫俗称）
 * "红墙飞檐、黑色顶瓦、黄色大字"；顶宫墙色无载，随山门作红墙并在帮助面板注明写意。
 * 殿名一律用查得到的名字（灵官殿、藏经楼、太元宝殿、坎离宫、宗师殿、二圣殿；
 * 睹星门、三天门、万寿台、太元殿、三官殿、慈航殿、勉斋道院），查不到的不补名。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, PAL, lit, mesh, box, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, plaqueMesh, glow, rand, rr, registerOccluder } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import * as T from './textures.js';
import { PADS, DINGGONG, YINGONG, GATE, MEMORIAL, MJJ, DEYOU, WANSHOU, WATER_Y } from './data.js';
import { padTop, heightAt, slopeAt } from './relief.js';

/* ------------------------------------------------------------------ 墙色 */
const palettes = {
  gray: { wall: '#8f9aa4', roof: M.roof, pillar: '#6d3a2c', note: '灰墙黛瓦（可考）' },
  red: { wall: '#a8453a', roof: M.roof, pillar: '#8c2f26', note: '红墙黑瓦黄字（可考）' },
};
function wallMat(key) {
  const p = palettes[key] || palettes.gray;
  return lit(p.wall, { map: TX.plaster(key === 'red' ? '#9c4034' : '#828d97'), rough: 0.92, emissive: key === 'red' ? '#170a07' : '#0d1116', ei: 0.4 });
}

/* ------------------------------------------------------------------ 台地勒脚 */
/**
 * 台基外缘到自然地面的一圈石壁：先竖直一道勒脚，再斜到坡面。
 * 挖方侧（背后是山）它挡住生土，填方侧（下面是坡）它是挡土墙——都是"依山作台"的做法。
 */
function skirtGeo(pad) {
  const top = padTop(pad.id);
  const N = 44;
  const pos = [], uv = [], idx = [];
  const corners = [
    [pad.x - pad.rx, pad.z - pad.rz], [pad.x + pad.rx, pad.z - pad.rz],
    [pad.x + pad.rx, pad.z + pad.rz], [pad.x - pad.rx, pad.z + pad.rz],
  ];
  const edgePoint = (t) => {
    const seg = Math.min(3, Math.floor(Math.min(0.9999, t) * 4));
    const a = corners[seg], b = corners[(seg + 1) % 4];
    const u = Math.min(0.9999, t) * 4 - seg;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  // 外法线：矩形四条边方向固定
  const normalOf = (t) => {
    const seg = Math.min(3, Math.floor(Math.min(0.9999, t) * 4));
    return [[0, -1], [1, 0], [0, 1], [-1, 0]][seg];
  };
  let run = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [ex, ez] = edgePoint(t);
    const [nx, nz] = normalOf(t);
    if (i > 0) run += Math.hypot(ex - edgePoint((i - 1) / N)[0], ez - edgePoint((i - 1) / N)[1]);
    const toe = [ex + nx * 4.2, ez + nz * 4.2];
    const toeY = heightAt(toe[0], toe[1]);
    // 三点剖面：压顶 → 壁面 → 坡脚
    const rows = [
      [ex, top + 0.5, ez],
      [ex + nx * 0.7, top - 1.1, ez + nz * 0.7],
      [toe[0], toeY - 0.2, toe[1]],
    ];
    for (const r of rows) {
      pos.push(r[0], r[1], r[2]);
      uv.push(run / 8, r[1] / 4);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    for (const [p, q, r, s] of [[0, 1, 3, 4], [1, 2, 4, 5]]) idx.push(a + p, a + r, a + q, a + q, a + r, a + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildTerraces(scene, anchors) {
  const grp = new THREE.Group();
  const stone = lit('#9aa1ad', { map: TX.stone('#7f8794'), rough: 0.93, side: THREE.DoubleSide, emissive: '#0c1016', ei: 0.34 });
  const pave = lit('#a7a9a4', { map: T.flagstone('#868a92'), rough: 0.9, emissive: '#0b0e12', ei: 0.3 });
  for (const pad of PADS) {
    const top = padTop(pad.id);
    if (pad.wall) grp.add(new THREE.Mesh(skirtGeo(pad), stone));
    // 台面：略低于压顶，免得和勒脚顶打架
    const deck = new THREE.Mesh(new THREE.BoxGeometry(pad.rx * 2, 0.5, pad.rz * 2), pave);
    deck.position.set(pad.x, top - 0.25, pad.z);
    grp.add(deck);
    if (pad.id === 'gate' || pad.id === 'laozi') {
      // 广场沿边的栏杆：只沿东西两条长边
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(railingGeo(pad.rx * 2 - 6, { height: 1.0, spacing: 2.0 }), M.stoneDressed);
        rail.position.set(pad.x, top, pad.z + s * (pad.rz - 2.2));
        grp.add(rail);
      }
    }
    // 台基四角的位置留给灯
    anchors.corners.push({ pad: pad.id, top, pts: cornersOf(pad).map(([x, z]) => [x, top, z]) });
  }
  scene.add(grp);
  return { grp, stone, pave };
}
const cornersOf = (p) => [
  [p.x - p.rx + 3, p.z - p.rz + 3], [p.x + p.rx - 3, p.z - p.rz + 3],
  [p.x + p.rx - 3, p.z + p.rz - 3], [p.x - p.rx + 3, p.z + p.rz - 3],
];

/* ------------------------------------------------------------------ 单体殿宇 */
/**
 * 一间殿：台基 → 檐柱 → 墙身 → 格窗发光面 → 屋顶 → 正脊 → 匾。
 * 面阔按 bays 间排（太元宝殿"面阔五间、进深三间"是可考口径），其余按名数推定。
 */
export function hall(spec, { palette = 'gray', platform = 0, label = true } = {}) {
  const pal = palettes[palette] || palettes.gray;
  const g = new THREE.Group();
  const { w, d, h, bays = 3, name } = spec;
  const wallH = Math.max(3.2, h - 2.9);
  const base = Math.max(0.7, h * 0.13);

  g.add(mesh([box(w + 3, base, d + 3, 0, base / 2, 0), box(w + 3.8, 0.34, d + 3.8, 0, base + 0.1, 0)], M.stoneDark));
  // 踏道（南面）
  g.add(mesh(box(w * 0.34, base + 0.1, 2.4, 0, (base + 0.1) / 2, d / 2 + 2.6), M.stoneDressed));

  const body = mesh([
    box(w, wallH, d, 0, base + wallH / 2, 0),
  ], wallMat(palette));
  g.add(body);

  // 檐柱：前后各 bays+1 根
  for (const sign of [1, -1]) {
    for (let i = 0; i <= bays; i++) {
      const x = -w / 2 + (w * i) / bays;
      const p = new THREE.Mesh(pillarGeo(wallH, 0.32), pal.pillar === '#8c2f26' ? M.pillarBright : M.pillar);
      p.position.set(x, base, sign * (d / 2 + 0.45));
      g.add(p);
    }
  }
  // 正面格窗与门：夜里就靠这几面发光
  const doorW = Math.min(2.6, w / bays);
  const lat = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, wallH * 0.66),
    new THREE.MeshBasicMaterial({ map: TX.lattice(bays * 2, 4, '#3a2116', '#ffd39a'), toneMapped: false, transparent: true }));
  lat.position.set(0, base + wallH * 0.42, d / 2 + 0.14);
  g.add(lat);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, wallH * 0.72), glow('#ffbe72', 0.62));
  door.position.set(0, base + wallH * 0.36, d / 2 + 0.2);
  g.add(door);

  // 屋顶
  const rw = w + (spec.main ? 3.4 : 2.4), rd = d + (spec.main ? 2.8 : 2);
  const roof = new THREE.Mesh(chineseRoof({
    width: rw, depth: rd, height: Math.max(1.8, h * 0.3),
    ridgeRatio: spec.rect ? 0.92 : (spec.main ? 0.44 : 0.52), curve: 0.6, eaveLift: 0.55, overhang: 0.5,
  }), pal.roof);
  roof.position.y = base + wallH;
  roof.material.side = THREE.DoubleSide;
  g.add(roof);
  const ridge = new THREE.Mesh(ridgeOrnament({
    width: rw - 1, depth: rd - 1, height: Math.max(1.8, h * 0.3), ridgeRatio: spec.rect ? 0.92 : (spec.main ? 0.44 : 0.52),
  }), M.ridge);
  ridge.position.y = base + wallH;
  g.add(ridge);

  if (label && name) {
    const pl = plaqueMesh(name, Math.min(3.6, w * 0.5), Math.min(1.15, wallH * 0.28), { bg: '#122a44', fg: '#f4dcae', dir: 'h' });
    pl.position.set(0, base + wallH * 0.86, d / 2 + 0.5);
    g.add(pl);
  }
  g.userData.eaveY = base + wallH + h * 0.28;
  g.userData.frontZ = d / 2 + 0.8;
  g.userData.wallH = wallH;
  g.userData.base = base;
  void platform;
  return g;
}

/** 门／石坊：两根柱 + 额枋 + 楼顶，可刻字 */
export function gateArch({ w, h, text, stone = false, posts = 2 }) {
  const g = new THREE.Group();
  const mat = stone ? M.stoneDressed : M.pillarBright;
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(pillarGeo(h * 0.72, 0.42), mat);
    col.position.set(s * w / 2, 0, 0);
    g.add(col);
    if (posts > 2) {
      const side = new THREE.Mesh(pillarGeo(h * 0.5, 0.3), mat);
      side.position.set(s * w * 0.78, 0, 0);
      g.add(side);
    }
  }
  g.add(mesh(box(w * 1.28, 0.7, 0.8, 0, h * 0.72, 0), stone ? M.stone : M.beam));
  const lintel = mesh([box(w * 1.2, 1.5, 0.7, 0, h * 0.72 + 1.1, 0)], stone ? M.stone : wallMat('red'));
  g.add(lintel);
  if (text) {
    const pl = plaqueMesh(text, w * 0.72, 1.05, { bg: stone ? '#2b3138' : '#122a44', fg: '#f6dca8', dir: 'h' });
    pl.position.set(0, h * 0.72 + 1.1, 0.45);
    g.add(pl);
  }
  const roofH = Math.max(1.2, h * 0.2);
  const rw = w * 1.5, rd = 2.6;
  const rh = roofH;
  const r = new THREE.Mesh(chineseRoof({ width: rw, depth: rd, height: rh, ridgeRatio: 0.5, curve: 0.66, eaveLift: 0.7, overhang: 0.4 }), M.roof);
  r.position.y = h * 0.72 + 1.95;
  const rr2 = new THREE.Mesh(ridgeOrnament({ width: w * 1.2, depth: 2.2, height: rh, ridgeRatio: 0.5 }), M.ridge);
  rr2.position.y = h * 0.72 + 1.95;
  g.add(r, rr2);
  return g;
}

/* ------------------------------------------------------------------ 三处宫观 */
function placeOnPad(group, site, dz, dx = 0) {
  const y = padTop(site.pad);
  group.position.set(site.x + dx, y, site.z + dz);
  return group;
}

function buildDinggong(scene, anchors) {
  const grp = new THREE.Group();
  const eaves = [];
  for (const s of DINGGONG.halls) {
    const b = hall(s, { palette: 'red' });
    placeOnPad(b, DINGGONG, s.dz);
    grp.add(b);
    eaves.push([DINGGONG.x, padTop(DINGGONG.pad) + b.userData.eaveY, DINGGONG.z + s.dz + (s.d / 2 + 0.9)]);
    if (s.main) anchors.mainHall = { x: DINGGONG.x, y: padTop(DINGGONG.pad) + b.userData.base + b.userData.wallH, z: DINGGONG.z + s.dz };
  }
  for (const s of DINGGONG.sideHalls) {
    const b = hall({ ...s, rect: true }, { palette: 'red' });
    placeOnPad(b, DINGGONG, s.dz, s.dx);
    b.rotation.y = Math.PI / 2;
    grp.add(b);
  }
  for (const gt of DINGGONG.gates) {
    const a = gateArch({ w: gt.w, h: gt.h, text: gt.text, stone: gt.stone, posts: gt.stone ? 4 : 2 });
    placeOnPad(a, DINGGONG, gt.dz, gt.dx || 0);
    grp.add(a);
    anchors.gateLights.push([DINGGONG.x + (gt.dx || 0), padTop(DINGGONG.pad) + gt.h, DINGGONG.z + gt.dz]);
  }
  // 宫前广场：香炉、幡杆、柏树
  const plaza = DINGGONG.plaza;
  const censer = new THREE.Group();
  censer.add(mesh(box(3.6, 0.4, 3.6, 0, 1.4, 0), M.stoneDressed));
  censer.add(mesh(box(2.6, 1.2, 2.6, 0, 0.6, 0), M.ink));
  censer.position.set(DINGGONG.x, padTop(DINGGONG.pad), DINGGONG.z + plaza.dz - 6);
  grp.add(registerOccluder(censer, 5.5, censer.position.clone()));
  anchors.censer = { x: censer.position.x, y: censer.position.y + 1.8, z: censer.position.z };
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 9, 8), M.beam);
    pole.position.set(DINGGONG.x + s * 13, padTop(DINGGONG.pad) + 4.5, DINGGONG.z + plaza.dz - 2);
    grp.add(pole);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 5.4),
      new THREE.MeshBasicMaterial({ map: T.banner(s < 0 ? '上清宗坛' : '第一福地'), side: THREE.DoubleSide, transparent: true, toneMapped: false }));
    ban.position.set(DINGGONG.x + s * 13 + 0.9 * s, padTop(DINGGONG.pad) + 5.6, DINGGONG.z + plaza.dz - 2);
    grp.add(ban);
  }
  scene.add(grp);
  anchors.eaves = anchors.eaves.concat(eaves);
  anchors.summit = { x: DINGGONG.x, z: DINGGONG.z, top: padTop(DINGGONG.pad) };
  return grp;
}

function buildYingong(scene, anchors) {
  const grp = new THREE.Group();
  const eaves = [];
  for (const s of YINGONG.halls) {
    const b = hall(s, { palette: 'gray' });
    placeOnPad(b, YINGONG, s.dz);
    grp.add(b);
    eaves.push([YINGONG.x, padTop(YINGONG.pad) + b.userData.eaveY, YINGONG.z + s.dz + (s.d / 2 + 0.9)]);
  }
  for (const s of YINGONG.wings) {
    const b = hall({ ...s, rect: true }, { palette: 'gray' });
    placeOnPad(b, YINGONG, s.dz, s.dx);
    b.rotation.y = Math.PI / 2;
    grp.add(b);
  }
  // 淳祐九年御书"上清宗坛"的宗坛祠与碑
  const zt = YINGONG.zongtan;
  const stele = new THREE.Group();
  stele.add(mesh(box(3.2, 0.7, 2.2, 0, 0.35, 0), M.stoneDark));
  stele.add(mesh(box(2.4, 3.4, 0.5, 0, 2.3, 0), M.stoneDressed));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.4),
    new THREE.MeshBasicMaterial({ map: TX.plaque('上清宗坛', { dir: 'v', bg: '#22262c', fg: '#f2dcae' }), toneMapped: false }));
  face.position.set(0, 2.3, 0.3);
  stele.add(face);
  placeOnPad(stele, YINGONG, zt.dz, zt.dx);
  grp.add(stele);
  anchors.stele = { x: YINGONG.x + zt.dx, y: padTop(YINGONG.pad) + 2.4, z: YINGONG.z + zt.dz };
  scene.add(grp);
  anchors.eaves = anchors.eaves.concat(eaves);
  anchors.yingongTop = padTop(YINGONG.pad);
  return grp;
}

function buildFoot(scene, anchors) {
  const grp = new THREE.Group();
  // 景区牌坊：红墙黑瓦黄字，与老子像同在中轴上
  const pf = gateArch({ w: GATE.paifang.w, h: GATE.paifang.h, text: GATE.paifang.name, posts: 4 });
  pf.position.set(GATE.x, padTop(GATE.pad), GATE.z + GATE.paifang.dz);
  grp.add(registerOccluder(pf, 9, new THREE.Vector3(GATE.x, 0, GATE.z + GATE.paifang.dz)));
  anchors.paifang = { x: GATE.x, y: padTop(GATE.pad) + GATE.paifang.h, z: GATE.z + GATE.paifang.dz };

  // 福地·洞天 两面石坊在牌坊后两侧
  for (const [dx, text] of [[-46, GATE.plaqueWords], [46, GATE.plaqueWordsBack]]) {
    const a = gateArch({ w: 7.4, h: 6.2, text, stone: true });
    a.position.set(GATE.x + dx, padTop(GATE.pad), GATE.z + GATE.paifang.dz + 8);
    grp.add(a);
  }
  // 游客区屋舍：沿广场东缘一排
  for (let i = 0; i < 4; i++) {
    const b = hall({ w: 12, d: 7, h: 5.4, bays: 3, name: i === 0 ? '售票' : null }, { palette: 'gray' });
    b.position.set(GATE.x + 92, padTop(GATE.pad), GATE.z - 40 + i * 22);
    b.rotation.y = -Math.PI / 2;
    grp.add(b);
  }
  // 德佑观（2013 复建，形制写意）
  const dy = DEYOU.halls.map((s) => {
    const b = hall({ ...s, bays: 3 }, { palette: 'gray' });
    b.position.set(DEYOU.x, heightAt(DEYOU.x, DEYOU.z + s.dz), DEYOU.z + s.dz);
    grp.add(b);
    return b;
  });
  anchors.deyou = { x: DEYOU.x, y: heightAt(DEYOU.x, DEYOU.z) + 8, z: DEYOU.z };
  void dy;

  // 崇禧万寿宫（红庙）：红墙在黑瓦下最跳，临水一面留灯影
  const ws = hall({ w: WANSHOU.w, d: WANSHOU.d, h: WANSHOU.h, bays: 3, name: '崇禧万寿宫', main: true }, { palette: 'red' });
  ws.position.set(WANSHOU.x, padTop(WANSHOU.pad), WANSHOU.z);
  grp.add(ws);
  const wGate = gateArch({ w: 9, h: 6.4, text: '红庙', posts: 4 });
  wGate.position.set(WANSHOU.x, padTop(WANSHOU.pad), WANSHOU.z + 30);
  grp.add(wGate);
  anchors.wanshou = { x: WANSHOU.x, y: padTop(WANSHOU.pad) + WANSHOU.h, z: WANSHOU.z + WANSHOU.d / 2 };

  // 新四军纪念馆：现代体量，檐下是一条灯带
  const m = new THREE.Group();
  const bodyM = mesh([box(MJJ.w, MJJ.h, MJJ.d, 0, MJJ.h / 2, 0), box(MJJ.w + 4, 1, MJJ.d + 4, 0, MJJ.h + 0.5, 0)], M.stoneDark);
  m.add(bodyM);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(MJJ.w * 0.92, 1.1), glow(PAL.lanternWarm, 0.8));
  band.position.set(0, MJJ.h * 0.62, MJJ.d / 2 + 0.2);
  m.add(band);
  const sign = plaqueMesh(MJJ.name, 16, 2.2, { bg: '#1b2028', fg: '#f6d8a8', dir: 'h' });
  sign.position.set(0, MJJ.h * 0.86, MJJ.d / 2 + 0.4);
  m.add(sign);
  m.position.set(MJJ.x, padTop(MJJ.pad), MJJ.z);
  grp.add(m);
  anchors.museum = { x: MJJ.x, y: padTop(MJJ.pad) + MJJ.h, z: MJJ.z + MJJ.d / 2 };

  // 苏南抗战胜利纪念碑：碑身 28 + 须弥座 3.13，通高取 36 一说
  const mm = new THREE.Group();
  const baseH = MEMORIAL.baseH;
  mm.add(mesh(box(14, baseH, 10, 0, baseH / 2, 0), M.stoneDressed));
  mm.add(mesh(box(11, 1.2, 8, 0, baseH + 0.6, 0), M.stoneDressed));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.3, MEMORIAL.shaftH, 4, 1),
    lit('#c9ccd2', { map: TX.stone('#aab0b8'), rough: 0.72, emissive: '#101319', ei: 0.4 }));
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = baseH + 1.2 + MEMORIAL.shaftH / 2;
  mm.add(shaft);
  const faceM = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 12),
    new THREE.MeshBasicMaterial({ map: TX.plaque('苏南抗战胜利纪念碑', { dir: 'v', bg: '#2a2f38', fg: '#f7e0b0' }), toneMapped: false }));
  faceM.position.set(0, baseH + 1.2 + 8, 1.45);
  mm.add(faceM);
  mm.position.set(MEMORIAL.x, padTop(MEMORIAL.pad), MEMORIAL.z - 18);
  grp.add(mm);
  anchors.memorial = { x: MEMORIAL.x, y: padTop(MEMORIAL.pad) + MEMORIAL.height, z: MEMORIAL.z - 18 };
  scene.add(grp);
  return grp;
}

/* ------------------------------------------------------------------ 植被 */
function pineGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, 3.1, 6);
  trunk.translate(0, 1.55, 0);
  parts.push(trunk);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(1.5 - i * 0.28, 1.5, 7, 1);
    c.translate(0, 2.6 + i * 1.05, 0);
    parts.push(c);
  }
  return mergeGeometries(parts);
}
function bambooGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = rand() * 6.28, r = rand() * 0.55;
    const h = 5.4 + rand() * 2.6;
    const stalk = new THREE.CylinderGeometry(0.06, 0.09, h, 5);
    stalk.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    stalk.rotateZ(rr(-0.06, 0.06));
    parts.push(stalk);
    for (let k = 0; k < 3; k++) {
      const tuft = new THREE.SphereGeometry(0.62 + rand() * 0.3, 6, 4);
      tuft.scale(1.5, 0.5, 1.5);
      tuft.translate(Math.cos(a) * r + rr(-0.4, 0.4), h * (0.7 + k * 0.12), Math.sin(a) * r + rr(-0.4, 0.4));
      parts.push(tuft);
    }
  }
  return mergeGeometries(parts);
}

function plantSlopes(scene, anchors) {
  const grp = new THREE.Group();
  const needle = lit('#1d2a20', { rough: 0.96, side: THREE.DoubleSide, emissive: '#070d09', ei: 0.4 });
  const bamboo = lit('#26402c', { rough: 0.94, side: THREE.DoubleSide, emissive: '#0a1410', ei: 0.42 });
  const pine = pineGeo(), bam = bambooGeo();
  const used = [];
  const tooClose = (x, z, r) => used.some(([ux, uz]) => Math.hypot(x - ux, z - uz) < r);
  // 松：坡面随机；竹：只长在山脚与台地边缘（"青竹繁茂，绿树蔽山"）
  for (let i = 0; i < 260; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 120 + Math.pow(rand(), 0.7) * 760;
    const x = Math.cos(ang) * rad - 40, z = Math.sin(ang) * rad + 40;
    const y = heightAt(x, z);
    if (y - WATER_Y < 2) continue;
    const sl = slopeAt(x, z, 6);
    if (sl > 0.95) continue;
    if (tooClose(x, z, 11)) continue;
    used.push([x, z]);
    const alt = y - WATER_Y;
    const geo = alt < 190 && sl < 0.5 ? (rand() > 0.45 ? bam : pine) : pine;
    const t = new THREE.Mesh(geo, geo === bam ? bamboo : needle);
    const s = 0.7 + rand() * 0.75;
    t.scale.set(s, s * rr(0.9, 1.25), s);
    t.position.set(x, y - 0.2, z);
    t.rotation.y = rand() * 6.28;
    grp.add(registerOccluder(t, 5.2, new THREE.Vector3(x, 0, z)));
  }
  scene.add(grp);
  anchors.grove = used;
  return grp;
}

export function buildBuildings(scene) {
  const anchors = {
    eaves: [], corners: [], gateLights: [],
  };
  const terraces = buildTerraces(scene, anchors);
  const dinggong = buildDinggong(scene, anchors);
  const yingong = buildYingong(scene, anchors);
  const foot = buildFoot(scene, anchors);
  const plants = plantSlopes(scene, anchors);
  return { anchors, terraces, dinggong, yingong, foot, plants };
}
