import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, PAL, lit, glow, rr, ri, rand, box, mesh, hall, pavilion, terraceGeo,
  chineseRoof, ridgeOrnament, pillarGeo, railingGeo, plaqueMesh,
  wallWithHoles, corridorRun, stoneSteps, groundPatch, hill, registerOccluder,
} from './kit.js';
import * as T from './textures.js';
import { SITE, GARDEN, HOUSE, PONDS, clearOfStations } from './data.js';

/**
 * 个园的骨架：园墙（南墙一排音洞与梅花窗、月洞园门）、南部住宅三路、
 * 中部一泓水池与水中清漪亭、四组假山与抱山楼—丛书楼—透风漏月厅。
 * 石材分工是这片景子的主轴——春山石笋、夏山湖石、秋山黄石、冬山宣石。
 * 轴向：+X 东、+Z 南、−Z 北，园内地平 y = 0；中轴建筑敞面朝南。
 */

const WX0 = SITE.wall.x0, WX1 = SITE.wall.x1, WZ0 = SITE.wall.z0, WZ1 = SITE.wall.z1;
const WH = SITE.wall.h, WT = SITE.wall.t;

/* ------------------------------------------------------------------ 地面 */

function buildGround(scene) {
  const { minX, maxX, minZ, maxZ } = SITE;
  const poly = PONDS[0].pts;
  // 池内要把地面压下去，否则水线被地形顶穿，一泓水就画成了黑洞
  const inPond = (x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  const g = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 64, 64);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGarden = new THREE.Color('#2b2f38');
  const cHouse = new THREE.Color('#252832');
  const cGrove = new THREE.Color('#1b241f');
  const cOut = new THREE.Color('#11141c');
  const cBed = new THREE.Color('#0d1420');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (minX + maxX) / 2;
    const z = pos.getZ(i) + (minZ + maxZ) / 2;
    const water = inPond(x, z);
    pos.setY(i, water ? -0.62 : -0.03 + Math.sin(x * 0.09) * Math.cos(z * 0.077) * 0.05);
    let c = cGarden;
    if (water) c = cBed;
    else if (z > WZ1) c = cHouse;
    else if (z < SITE.wanzhu.z1 && z > SITE.wanzhu.z0) c = cGrove;
    if (Math.abs(x) > WX1 + 10 || z > SITE.maxZ - 4 || z < SITE.minZ + 6) c = cOut;
    const k = 0.86 + rand() * 0.2;
    colors.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
  m.receiveShadow = true;
  m.name = 'ge-ground';
  scene.add(m);

  const paths = [
    [3.2, 14, GARDEN.gate.x, 21], [22, 3.2, 12, 16.5],
    [3.2, 22, -20, 2], [3.2, 12, 34, -10],
    [26, 3.2, -20, -13], [3.2, 26, -6, -28], [30, 3.2, 0, -30],
  ];
  for (const [w, d, x, z] of paths) scene.add(groundPatch(w, d, x, z, M.pave, 0.03));
  return m;
}

/* ------------------------------------------------------------------ 园墙与园门 */

function buildWalls(scene) {
  const group = new THREE.Group();
  group.name = 'ge-walls';
  const southHoles = [];

  // 南湖墙：早期资料只作"多留圆洞，称之为音洞"，数量不设定说
  const nFrom = GARDEN.winter.nicheFrom, nTo = GARDEN.winter.nicheTo;
  const step = (nTo - nFrom) / 11;
  for (let i = 0; i < 12; i++) southHoles.push({ x: nFrom + step * i, y: 1.9, round: true, r: 0.42 });
  // 春山一线：四扇梅花窗
  for (let i = 0; i < GARDEN.spring.plumWindows; i++) {
    southHoles.push({ x: 6 + i * 6.4, y: 2.35, flower: true, r: 0.62 });
  }
  // 月洞形园门
  southHoles.push({ x: GARDEN.gate.x, y: GARDEN.gate.r, round: true, r: GARDEN.gate.r });

  const south = wallWithHoles({ length: WX1 - WX0, height: WH, thickness: WT, holes: southHoles });
  south.position.set(0, 0, WZ1);
  group.add(south);
  registerOccluder(south, 2.0, new THREE.Vector3(0, WH / 2, WZ1));

  const north = wallWithHoles({ length: WX1 - WX0, height: WH, thickness: WT });
  north.position.set(0, 0, WZ0);
  group.add(north);
  for (const x of [WX0, WX1]) {
    const side = wallWithHoles({ length: WZ1 - WZ0, height: WH, thickness: WT });
    side.position.set(x, 0, (WZ0 + WZ1) / 2);
    side.rotation.y = Math.PI / 2;
    group.add(side);
    registerOccluder(side, 2.4, new THREE.Vector3(x, WH / 2, (WZ0 + WZ1) / 2));
  }

  // 洞后的暗腔与一点洞光：夜里读得出"这些洞是通的"
  const nicheGlow = new THREE.Group();
  nicheGlow.name = 'niche-glow';
  const backMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#232d3e'), fog: false, toneMapped: false });
  for (const h of southHoles) {
    if (h.flower || Math.abs(h.x - GARDEN.gate.x) < 1.6) continue;
    const r = h.r || 0.5;
    const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 14), backMat);
    back.position.set(h.x, h.y, WZ1 + WT / 2 + 0.04);
    back.rotation.y = Math.PI;
    nicheGlow.add(back);
    const fleck = new THREE.Mesh(new THREE.CircleGeometry(r * 0.34, 10), glow(PAL.lanternWarm, 1.3));
    fleck.position.set(h.x, h.y - 0.05, WZ1 + WT / 2 + 0.02);
    fleck.rotation.y = Math.PI;
    nicheGlow.add(fleck);
  }
  group.add(nicheGlow);

  // 园门：石额"个园" + 砖雕檐罩。额用双面，园内园外都读得出
  const gx = GARDEN.gate.x;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(GARDEN.gate.r + 0.08, 0.11, 6, 26), M.stoneDark);
  ring.position.set(gx, GARDEN.gate.r, WZ1 - WT / 2 - 0.06);
  group.add(ring);
  const gatePlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.0),
    new THREE.MeshBasicMaterial({ map: T.brickCarve('个园'), toneMapped: false, side: THREE.DoubleSide }));
  gatePlaque.position.set(gx, 3.5, WZ1 - WT / 2 - 0.05);
  group.add(gatePlaque);
  const gateEave = new THREE.Mesh(
    chineseRoof({ width: 4.4, depth: 1.4, height: 0.7, hip: false, ridgeRatio: 1, overhang: 0.18 }), M.roofDark);
  gateEave.position.set(gx, 4.1, WZ1);
  group.add(gateEave);

  scene.add(group);
  return { group, nicheGlow };
}

/* ------------------------------------------------------------------ 住宅三路 */

function buildHouse(scene) {
  const group = new THREE.Group();
  group.name = 'ge-house';
  const A = HOUSE.axis;

  // 中轴三进：门厅、大厅、楼厅（后两进为二层楼），敞面朝南
  for (const e of [
    { ...A.men, wallH: 4.0, roofH: 2.3, baysX: 3, plaque: null },
    { ...A.ting, wallH: 5.0, roofH: 2.9, baysX: 5, plaque: '大厅' },
  ]) {
    const h = hall({
      w: e.w, d: e.d, wallH: e.wallH, baysX: e.baysX, baysZ: 2, roofH: e.roofH,
      openFront: true, plaque: e.plaque,
    });
    h.position.set(0, 0, e.z);
    group.add(h);
    group.add(groundPatch(e.w + 6, 8, 0, e.z - 6, M.pave, 0.03));
  }
  const lou = storiedHall({ w: A.lou.w, d: A.lou.d, floors: 2, floorH: 3.4, roofH: 2.6, baysX: 4 });
  lou.position.set(0, 0, A.lou.z);
  group.add(lou);

  /* 火巷：两路之间一条窄巷，北口一通素墙门 */
  const L = HOUSE.lane;
  const laneLen = L.zTo - L.zFrom;
  for (const x of [L.wallIn, L.wallOut]) {
    const w = wallWithHoles({ length: laneLen, height: HOUSE.wallH, thickness: 0.4 });
    w.position.set(x, 0, (L.zFrom + L.zTo) / 2);
    w.rotation.y = Math.PI / 2;
    group.add(w);
  }
  const gx = (L.wallIn + L.wallOut) / 2;
  const gateWall = wallWithHoles({
    length: L.wallOut - L.wallIn + 2.4, height: HOUSE.wallH, thickness: 0.45,
    holes: [{ x: 0, y: 1.5, w: 2.2, h: 3.0 }],
  });
  gateWall.position.set(gx, 0, L.zFrom);
  group.add(gateWall);
  for (let k = 0; k < 3; k++) {
    const band = new THREE.Mesh(box(2.6 + k * 0.34, 0.15, 0.24 + k * 0.08), M.stoneDark);
    band.position.set(gx, 3.3 + k * 0.19, L.zFrom + 0.3 + k * 0.05);
    group.add(band);
  }
  const gateTop = new THREE.Mesh(
    chineseRoof({ width: 3.4, depth: 1.1, height: 0.58, hip: false, ridgeRatio: 1, overhang: 0.12 }), M.roofDark);
  gateTop.position.set(gx, 3.98, L.zFrom + 0.32);
  group.add(gateTop);

  /* 东第与西第：各三进，西路作"明三暗五"的两层楼 */
  const east = hall({ w: HOUSE.east.w, d: HOUSE.east.d, wallH: 4.0, baysX: 3, baysZ: 2, roofH: 2.3, openFront: true });
  east.position.set(HOUSE.east.x, 0, HOUSE.east.z);
  group.add(east);
  const west = storiedHall({ w: HOUSE.west.w, d: HOUSE.west.d, floors: 2, floorH: 3.2, roofH: 2.4, baysX: 5 });
  west.position.set(HOUSE.west.x, 0, HOUSE.west.z);
  group.add(west);

  for (const x of [-42, 42]) {
    const w = wallWithHoles({ length: 60, height: 5.2, thickness: 0.42 });
    w.position.set(x, 0, 58);
    w.rotation.y = Math.PI / 2;
    group.add(w);
  }
  const sGate = wallWithHoles({
    length: 86, height: 5.2, thickness: 0.42,
    holes: [{ x: 0, y: 1.6, w: 2.8, h: 3.2 }],
  });
  sGate.position.set(0, 0, 88);
  group.add(sGate);

  scene.add(group);
  return group;
}

/** 两层楼：每层一圈柱与长窗，层间一道腰檐，顶上再覆屋面 */
function storiedHall({ w, d, floors = 2, floorH = 3.4, roofH = 2.6, baysX = 4 }) {
  const group = new THREE.Group();
  const ter = 0.6;
  group.add(new THREE.Mesh(terraceGeo({ w: w + 1.6, d: d + 1.6, h: ter }), M.step));
  for (let f = 0; f < floors; f++) {
    const y0 = ter + f * floorH;
    const H = floorH - 0.3;
    const posts = [];
    const nx = baysX + 1;
    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (w * i) / nx;
      for (const z of [-d / 2, d / 2]) posts.push(pillarGeo(H, 0.19).clone().translate(x, y0 + H / 2, z));
    }
    for (const x of [-w / 2, w / 2]) posts.push(pillarGeo(H, 0.19).clone().translate(x, y0 + H / 2, 0));
    group.add(mesh(posts, f === 0 ? M.pillar : M.pillarDark));
    group.add(new THREE.Mesh(box(w - 0.2, floorH * 0.62, d - 0.2, 0, y0 + floorH * 0.31, 0), M.wall));
    for (const s of [-1, 1]) {
      const row = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.88, floorH * 0.48), M.lattice);
      row.position.set(0, y0 + floorH * 0.44, s * (d / 2 + 0.03));
      if (s < 0) row.rotation.y = Math.PI;
      group.add(row);
    }
    for (const s of [-1, 1]) {
      const row = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.8, floorH * 0.44), M.lattice);
      row.position.set(s * (w / 2 + 0.03), y0 + floorH * 0.44, 0);
      row.rotation.y = s * Math.PI / 2;
      group.add(row);
    }
    const top = f === floors - 1;
    const eave = new THREE.Mesh(
      chineseRoof({
        width: w + 1.8, depth: d + 1.6, height: top ? roofH : 1.1,
        overhang: 0.5, ridgeRatio: 0.5, curve: 0.66,
      }), top ? M.roof : M.roofDark);
    eave.position.y = y0 + floorH - 0.1;
    group.add(eave);
    if (top) {
      group.add(new THREE.Mesh(
        ridgeOrnament({ width: w + 1.8, depth: d + 1.6, height: (y0 + floorH - 0.1) + roofH, ridgeRatio: 0.5, overhang: 0.5 }),
        M.ridge));
    } else {
      for (const s of [-1, 1]) {
        group.add(new THREE.Mesh(box(w + 1.9, 0.16, 0.44, 0, y0 + floorH + 0.86, s * (d / 2 + 0.5)), M.ridge));
      }
    }
    if (f > 0) {
      const rail = new THREE.Mesh(railingGeo(w * 0.56, { height: 0.7 }), M.stone);
      rail.position.set(0, y0 + 0.35, d / 2 + 0.72);
      group.add(rail);
    }
  }
  return group;
}

/* ------------------------------------------------------------------ 石材 */

/** 石笋：几节六棱台叠成一竿，梢头收尖 */
function stoneShoot(h = 2.2, r = 0.34) {
  const parts = [];
  const seg = ri(3, 5);
  let y = 0;
  for (let i = 0; i < seg; i++) {
    const k = i / seg;
    const rad = r * (1 - k * 0.55) * rr(0.9, 1.1);
    const th = (h / seg) * rr(0.92, 1.12);
    const g = new THREE.CylinderGeometry(rad * 0.86, rad, th, 6, 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const px = p.getX(v), pz = p.getZ(v);
      const wob = 0.1 * Math.sin(px * 4 + pz * 3);
      p.setXYZ(v, px * (1 + wob), p.getY(v), pz * (1 + wob));
    }
    g.computeVertexNormals();
    g.translate(rr(-0.06, 0.06) * r, y + th / 2, rr(-0.06, 0.06) * r);
    parts.push(g);
    y += th * 0.94;
  }
  const tip = new THREE.ConeGeometry(r * 0.36, h * 0.16, 6);
  tip.translate(0, y + h * 0.06, 0);
  parts.push(tip);
  const m = new THREE.Mesh(mergeGeometries(parts), M.shoot);
  m.rotation.z = rr(-0.09, 0.09);
  m.rotation.x = rr(-0.07, 0.07);
  m.castShadow = true;
  return m;
}

/** 湖石：压扁揉皱的球叠起来，透漏瘦靠深色凹腔暗示 */
function lakeRock(r, h) {
  const group = new THREE.Group();
  const lumps = ri(4, 6);
  let y = 0;
  for (let i = 0; i < lumps; i++) {
    const k = i / (lumps - 1 || 1);
    const rad = r * (1 - k * 0.42) * rr(0.72, 1.1);
    const g = new THREE.IcosahedronGeometry(rad, 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const px = p.getX(v), py = p.getY(v), pz = p.getZ(v);
      const w = 0.42 * Math.sin(px * 1.7 + py * 2.3) * Math.cos(pz * 1.9);
      const hole = 0.26 * Math.sin(px * 4.1 - pz * 3.3);
      p.setXYZ(v, px * (1 + w * 0.5 + hole * 0.2), py * (1 - 0.42 + w * 0.2), pz * (1 + w * 0.5));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.rockLake);
    m.position.set(rr(-0.3, 0.3) * r, y + rad * 0.5, rr(-0.3, 0.3) * r);
    m.rotation.set(rr(-0.4, 0.4), rr(0, 3), rr(-0.3, 0.3));
    m.castShadow = true;
    group.add(m);
    y += rad * (0.72 + k * 0.3);
  }
  group.scale.y = Math.max(0.5, h / Math.max(0.6, y));
  return group;
}

/** 宣石：白而多窍，团块相抱 */
function snowRock(r, h) {
  const group = new THREE.Group();
  const lumps = ri(3, 5);
  let y = 0;
  for (let i = 0; i < lumps; i++) {
    const k = i / (lumps - 1 || 1);
    const rad = r * (1 - k * 0.36) * rr(0.8, 1.1);
    const g = new THREE.IcosahedronGeometry(rad, 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const px = p.getX(v), pz = p.getZ(v);
      const w = 0.2 * Math.sin(px * 3.1 + pz * 2.2);
      p.setXYZ(v, px * (1 + w * 0.3), p.getY(v) * 0.72, pz * (1 + w * 0.3));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.rockSnow);
    m.position.set(rr(-0.3, 0.3) * r, y + rad * 0.55, rr(-0.3, 0.3) * r);
    m.rotation.set(rr(-0.3, 0.3), rr(0, 3), 0);
    m.castShadow = true;
    group.add(m);
    y += rad * 0.8;
  }
  group.scale.y = Math.max(0.4, h / Math.max(0.5, y));
  return group;
}

/** 石室：四壁一条梁，洞里摆一具石桌凳——秋山"飞梁石内置石桌凳"与夏山山腹石室同一做法 */
function stoneChamber({ w = 3.4, d = 2.6, h = 1.9, t = 0.4, mat = M.rockLake, mouth = [0, d / 2] }) {
  const group = new THREE.Group();
  const put = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };
  put(box(w, 0.24, d, 0, h, 0), mat);
  for (const s of [-1, 1]) put(box(t, h, d, s * (w / 2 - t / 2), h / 2, 0), mat);
  put(box(w, h, t, 0, h / 2, -d / 2 + t / 2), mat);
  put(box(w, h * 0.24, t, 0, h - h * 0.12, d / 2 - t / 2), mat);
  for (const s of [-1, 1]) put(box(0.3, h * 0.76, t, s * (w / 2 - 0.5), h * 0.38, d / 2 - t / 2), mat);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, h * 0.7),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#04070d'), fog: false, toneMapped: false }));
  dark.position.set(mouth[0], h * 0.36, d / 2 - t - 0.05);
  group.add(dark);
  put(box(0.9, 0.12, 0.6, 0, 0.52, -0.2), M.stoneDressed);
  for (const s of [-1, 1]) put(box(0.4, 0.4, 0.36, s * 0.85, 0.2, 0.3), M.stone);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

/* ------------------------------------------------------------------ 四组假山 */

/** 春山：石笋 + 修竹 + 十二生肖象形石 + 牡丹芍药 */
function buildSpringHill(group) {
  const S = GARDEN.spring;
  // 春山的底是一道长土冈，不是石阶：用暗土色，才衬得出石笋与竹
  const earth = lit('#4a4741', { map: T.stone('#3d3a34'), rough: 0.98 });
  const base = hill({ w: S.w, d: S.d, h: 1.8, terraces: 5, seedShift: 1.2 });
  base.position.set(S.cx, 0, S.cz);
  base.traverse((o) => { if (o.isMesh) o.material = earth; });
  group.add(base);

  for (let i = 0; i < S.shoots; i++) {
    const t = i / (S.shoots - 1);
    const x = S.cx - S.w / 2 + 2.4 + t * (S.w - 4.8);
    const z = S.cz + 1.2 + Math.sin(t * 3.1) * 1.4 + rr(-0.6, 0.6);
    const s = stoneShoot(rr(1.5, 2.9), rr(0.26, 0.4));
    s.position.set(x, 0.25, z);
    group.add(s);
  }
  // 十二生肖象形石：一列压得低低的浑石，各给一点体形差别
  for (let i = 0; i < S.zodiac; i++) {
    const t = i / (S.zodiac - 1);
    const g = new THREE.IcosahedronGeometry(rr(0.42, 0.78), 2);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const py = p.getY(v);
      p.setY(v, py * rr(0.62, 0.9));
      p.setX(v, p.getX(v) * rr(0.92, 1.16));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.stone);
    m.position.set(S.cx - S.w / 2 + 2.8 + t * (S.w - 5.6), 0.24, S.cz - 2.2 + rr(-0.5, 0.5));
    m.rotation.y = rr(0, 3);
    m.castShadow = true;
    group.add(m);
  }
  // 牡丹芍药：春山门前的那一片花
  for (let i = 0; i < 26; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.22, 0.4), 0),
      lit('#3c5c40', { rough: 0.95, side: THREE.DoubleSide }));
    b.position.set(S.cx + rr(-S.w / 2 + 1, S.w / 2 - 1), rr(0.15, 0.4), S.cz - 3.6 + rr(-0.8, 0.8));
    b.scale.y = 0.7;
    group.add(b);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), glow(i % 2 ? '#e8a8c8' : '#f2d9a8', 0.45));
    f.position.set(b.position.x, b.position.y + 0.32, b.position.z);
    group.add(f);
  }
  // 柏：压低的六株贴南墙做背景，不挡石笋；其余收在东山头
  for (const x of [4, 9, 15, 21, 26, 30]) {
    if (!clearOfStations(x, 26.5, 5)) continue;
    const c = conifer(rr(2.2, 3.0), rr(0.8, 1.1));
    c.position.set(x + rr(-0.4, 0.4), 0, 26.5);
    group.add(c);
  }
  for (let i = 0; i < 5; i++) {
    const x = S.cx + S.w / 2 + rr(1, 6), z = S.cz + rr(-4, 3);
    if (!clearOfStations(x, z, 5)) continue;
    const c = conifer(rr(3.6, 5.0), rr(1.1, 1.5));
    c.position.set(x, 0, z);
    group.add(c);
  }
  const plum = treeOfKind('plum', 4.0, 2.2);
  if (clearOfStations(S.cx - S.w / 2 - 1.8, S.cz + 1.4, 5)) group.add(plum);
  plum.position.set(S.cx - S.w / 2 - 1.8, 0, S.cz + 1.4);
}

/** 夏山：湖石三叠、山腹石室、东南石坡入水，山顶旧有紫藤架 */
function buildSummerHill(group) {
  const X = GARDEN.summer;
  const mass = new THREE.Group();
  const tiers = [
    { y: 0, sx: 1, sz: 1, h: 2.6, n: 10 },
    { y: 2.1, sx: 0.74, sz: 0.72, h: 2.8, n: 8 },
    { y: 4.2, sx: 0.46, sz: 0.46, h: 2.7, n: 5 },
  ];
  tiers.forEach((t, ti) => {
    for (let i = 0; i < t.n; i++) {
      const a = rr(0, Math.PI * 2), rad = Math.sqrt(rand());
      const px = X.cx + Math.cos(a) * X.w * 0.34 * t.sx * rad - (ti === 0 ? 2 : 3);
      const pz = X.cz + Math.sin(a) * X.d * 0.34 * t.sz * rad;
      const pk = lakeRock(rr(1.1, 2.0) * t.sx, t.h * rr(0.7, 1.2));
      pk.position.set(px, t.y + rr(-0.3, 0.3), pz);
      mass.add(pk);
    }
  });
  const chief = lakeRock(3.4, X.h);
  chief.position.set(X.cx - X.w * 0.22, 3.4, X.cz - X.d * 0.24);
  mass.add(chief);
  group.add(mass);

  // 山腹石室
  const chamber = stoneChamber({ w: 3.6, d: 2.8, h: 2.0, mat: M.rockLake });
  chamber.position.set(X.cx + 3, 1.1, X.cz + 5.5);
  chamber.rotation.y = rr(-0.3, 0.3);
  group.add(chamber);

  // 三叠洞：暗腔 + 一圈石檐
  const caveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#04070d'), fog: false, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const y = 1.0 + i * 1.7;
    const r = 1.0 - i * 0.2;
    const face = X.cz + X.d * 0.34;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(r, 14), caveMat);
    mouth.position.set(X.cx - 6, y, face);
    group.add(mouth);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.32, 10), glow('#4d6d88', 0.55));
    inner.position.set(X.cx - 6, y, face - 0.5);
    group.add(inner);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.1, 0.15, 5, 16), M.rockLake);
    ring.position.set(X.cx - 6, y, face + 0.05);
    group.add(ring);
  }
  // 东南石坡入水
  for (let i = 0; i < 7; i++) {
    const slab = new THREE.Mesh(box(rr(1.6, 2.8), 0.4, rr(1.0, 1.8)), M.stone);
    slab.position.set(X.cx + 6 + i * 1.5, 0.5 - i * 0.12, X.cz + 6 + i * 1.1);
    slab.rotation.set(rr(-0.1, 0.1), rr(-0.5, 0.5), rr(-0.16, 0.16));
    slab.castShadow = true; slab.receiveShadow = true;
    group.add(slab);
  }
  // 山顶紫藤架：四柱一条平顶，架上垂几串花
  const pergola = new THREE.Group();
  for (const [ox, oz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) {
    const post = new THREE.Mesh(pillarGeo(2.2, 0.11), M.pillarDark);
    post.position.set(ox, 0, oz);
    pergola.add(post);
  }
  for (const oz of [-1.2, 0, 1.2]) {
    pergola.add(new THREE.Mesh(box(3.6, 0.12, 0.14, 0, 2.2, oz), M.beam));
  }
  for (let i = 0; i < 16; i++) {
    const cluster = new THREE.Mesh(new THREE.ConeGeometry(0.12, rr(0.4, 0.8), 5), glow('#b79ad8', 0.5));
    cluster.position.set(rr(-1.6, 1.6), 2.0 - rr(0.1, 0.5), rr(-1.2, 1.2));
    cluster.rotation.x = Math.PI;
    pergola.add(cluster);
  }
  pergola.position.set(X.cx + 1, X.h * 0.62, X.cz - 3);
  group.add(pergola);

  for (const [ox, oz, kind, y] of [
    [-8, -5, 'pine', 3.2], [-2, -8, 'camphor', 4.0], [5, -4, 'maple', 2.6],
    [-11, 2, 'pine', 2.0], [8, 3, 'willow', 0.3], [-5, 7, 'camphor', 1.2],
  ]) {
    const wx = X.cx + ox, wz = X.cz + oz;
    if (!clearOfStations(wx, wz, 6)) continue;
    const t = treeOfKind(kind, rr(3.0, 4.8), rr(1.6, 2.3));
    t.position.set(wx, y, wz);
    group.add(t);
  }
}

/** 秋山：黄石西中南三峰，洞道盘旋，山巅拂云亭，南端丛书楼 */
function buildAutumnHill(group) {
  const Q = GARDEN.autumn;
  const mass = new THREE.Group();
  const peaks = [
    { x: 0, z: 0, w: 11, d: 9, h: Q.h },
    { x: -7, z: 2, w: 8, d: 7, h: Q.h * 0.68 },
    { x: 7, z: -3, w: 8, d: 6, h: Q.h * 0.8 },
    { x: -2, z: -6, w: 7, d: 5, h: Q.h * 0.56 },
    { x: 4, z: 5, w: 7, d: 5, h: Q.h * 0.46 },
  ];
  for (const p of peaks) {
    const terraces = ri(5, 7);
    for (let i = 0; i < terraces; i++) {
      const k = i / (terraces - 1);
      const slab = new THREE.Mesh(
        box(p.w * (1 - k * 0.46) * rr(0.85, 1.1), (p.h / terraces) * rr(0.9, 1.25), p.d * (1 - k * 0.44) * rr(0.85, 1.1)),
        M.rockYellow);
      slab.position.set(
        Q.cx + p.x + rr(-1.3, 1.3),
        (p.h / terraces) * i * 0.9 + (p.h / terraces) * 0.5,
        Q.cz + p.z + rr(-1.1, 1.1));
      slab.rotation.set(rr(-0.09, 0.09), rr(-0.4, 0.4), rr(-0.09, 0.09));
      slab.castShadow = true; slab.receiveShadow = true;
      mass.add(slab);
    }
    for (let i = 0; i < 3; i++) {
      const a = rr(0, Math.PI * 2);
      const wall = new THREE.Mesh(box(rr(2.2, 4.2), p.h * rr(0.3, 0.46), 0.85), M.rockYellow);
      wall.position.set(Q.cx + p.x + Math.cos(a) * p.w * 0.4, p.h * rr(0.24, 0.5), Q.cz + p.z + Math.sin(a) * p.d * 0.38);
      wall.rotation.set(rr(-0.12, 0.12), a + Math.PI / 2, rr(-0.18, 0.18));
      wall.castShadow = true;
      mass.add(wall);
    }
  }
  group.add(mass);

  // 蹬道与洞道：东南上、西北下，中间一段贴着崖走
  group.add(stoneSteps({ from: [Q.cx + 4, 0.2, Q.cz + 10], to: [Q.cx + 1, Q.h * 0.48, Q.cz + 3], count: 15, width: 1.5 }));
  group.add(stoneSteps({ from: [Q.cx + 1, Q.h * 0.48, Q.cz + 3], to: [Q.cx - 4, Q.h * 0.76, Q.cz - 2], count: 11, width: 1.2 }));
  group.add(stoneSteps({ from: [Q.cx - 4, Q.h * 0.76, Q.cz - 2], to: [Q.cx - 12, 1.0, Q.cz - 10], count: 13, width: 1.2 }));
  // 飞梁：一道石梁跨在两峰之间，梁下是洞道
  const beam = new THREE.Mesh(box(6.4, 0.42, 1.5), M.rockYellow);
  beam.position.set(Q.cx + 2, Q.h * 0.44, Q.cz + 1);
  beam.rotation.y = 0.5;
  beam.castShadow = true;
  group.add(beam);
  const chamber = stoneChamber({ w: 3.8, d: 3.0, h: 2.1, mat: M.rockYellow });
  chamber.position.set(Q.cx - 3, Q.h * 0.3, Q.cz - 4);
  chamber.rotation.y = -0.7;
  group.add(chamber);

  // 山巅方亭：通行作拂云亭（一说拂衣亭，未见可靠来源）
  const top = pavilion({ shape: 'square', size: 3.8, height: 2.5, roofH: 1.5, terrace: 0.28 });
  top.position.set(Q.peak.x, Q.h * 0.9, Q.peak.z);
  group.add(top);
  const fuyun = plaqueMesh('拂云亭', 1.5, 0.46);
  fuyun.position.set(Q.peak.x - 1.5, Q.h * 0.9 + 2.5, Q.peak.z);
  fuyun.rotation.y = -Math.PI / 2;
  group.add(fuyun);

  // 配植：枫叶与古柏；外小院旧植碧桃
  for (let i = 0; i < 12; i++) {
    const a = rr(0, Math.PI * 2), rad = rr(0.5, 1);
    const wx = Q.cx + Math.cos(a) * Q.w * 0.4 * rad, wz = Q.cz + Math.sin(a) * Q.d * 0.38 * rad;
    if (!clearOfStations(wx, wz, 6)) continue;
    const kind = ['pine', 'maple', 'camphor'][i % 3];
    const t = treeOfKind(kind, rr(2.6, 4.0), rr(1.4, 2.0));
    const y = [0.1, 1.9, 3.6, 5.2][i % 4] - 0.25;
    t.position.set(wx, y, wz);
    group.add(t);
  }
  for (let i = 0; i < 10; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), glow('#f0a8c0', 0.75));
    f.position.set(Q.cx + 8 + rr(-2, 3), rr(0.5, 1.3), Q.cz + 8 + rr(-2, 3));
    group.add(f);
  }
  return { peak: top };
}

/** 冬山：宣石群峰西高东低，地铺白矾石，配腊梅与南天竺 */
function buildWinterHill(group) {
  const D = GARDEN.winter;
  // 白矾石铺地：雪意不靠雪，靠这一地发白的小石子
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(D.w + 6, D.d + 6),
    lit('#b9c3cf', { map: T.stone('#9fa9b6'), rough: 0.86, emissive: '#2a3648', ei: 0.4 }));
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(D.cx, 0.05, D.cz);
  pave.receiveShadow = true;
  group.add(pave);

  const mass = new THREE.Group();
  const n = 15;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const prof = 1 - t * 0.7;
    const lump = snowRock(rr(1.0, 1.9) * (0.7 + prof * 0.6), D.h * prof * rr(0.45, 0.95));
    lump.position.set(D.cx - D.w / 2 + t * D.w + rr(-0.9, 0.9), 0, D.cz + rr(-D.d / 2, D.d / 2) * 0.7);
    mass.add(lump);
  }
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.16, 0.42), 0), M.rockSnow);
    m.position.set(D.cx + rr(-D.w / 2, D.w / 2), rr(0.02, 0.16), D.cz + rr(-D.d / 2, D.d / 2) * 1.3);
    m.scale.y = rr(0.3, 0.6);
    m.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
    m.castShadow = true;
    mass.add(m);
  }
  group.add(mass);

  // 腊梅数株 + 南天竺的红子
  for (let i = 0; i < 5; i++) {
    const wx = D.cx - D.w / 2 + rr(1, D.w - 2), wz = D.cz - D.d / 2 - rr(0.6, 2.4);
    if (!clearOfStations(wx, wz, 7)) continue;
    const t = treeOfKind('plum', rr(2.8, 4.0), rr(1.4, 2.0));
    t.position.set(wx, 0, wz);
    group.add(t);
  }
  for (let i = 0; i < 9; i++) {
    const bx = D.cx + rr(-D.w / 2, D.w / 2), bz = D.cz + D.d / 2 + rr(0.6, 2.2);
    if (!clearOfStations(bx, bz, 5)) continue;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.3, 0.52), 0),
      lit('#3f6b4a', { rough: 0.95, side: THREE.DoubleSide }));
    b.position.set(bx, rr(0.2, 0.5), bz);
    b.scale.y = 0.8;
    group.add(b);
    for (let j = 0; j < 6; j++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), glow('#d8503c', 0.8));
      berry.position.set(bx + rr(-0.3, 0.3), b.position.y + rr(0.3, 0.7), bz + rr(-0.3, 0.3));
      group.add(berry);
    }
  }
}

/* ------------------------------------------------------------------ 中部水池 */

function buildPond(scene, group) {
  const P = PONDS[0];
  const shape = new THREE.Shape();
  P.pts.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2);
  const mat = lit(PAL.water, { rough: 0.16, metal: 0.5, emissive: '#1a2c42', ei: 1.25, transparent: true, opacity: 0.95 });
  const water = new THREE.Mesh(g, mat);
  water.position.y = -0.1;
  water.name = 'ge-pond';
  scene.add(water);

  // 夜里水面本无反射可给，用几道贴水的月光波纹把它读出来
  const sparkMat = () => new THREE.MeshBasicMaterial({
    map: T.softGlow('176,206,238', 0.28), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  });
  const sparkGeo = new THREE.PlaneGeometry(1, 1);
  sparkGeo.rotateX(-Math.PI / 2);
  const sparkles = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat());
    m.material.toneMapped = false;
    const a = rand() * Math.PI * 2, rad = Math.sqrt(rand());
    m.position.set(GARDEN.pond.cx + Math.cos(a) * GARDEN.pond.rx * 0.82 * rad,
      -0.03 + i * 0.001,
      GARDEN.pond.cz + Math.sin(a) * GARDEN.pond.rz * 0.82 * rad);
    m.scale.set(rr(3.5, 9), 1, rr(0.1, 0.22));
    m.rotation.y = rr(-0.5, 0.5) + (rand() < 0.5 ? 0 : Math.PI / 2);
    m.userData = { base: rr(0.08, 0.2), ph: rand() * 6.28, x0: m.position.x, drift: rr(0.02, 0.07) };
    scene.add(m);
    sparkles.push(m);
  }
  // 驳岸：一圈压石
  for (let i = 0; i < P.pts.length - 1; i++) {
    const [x0, z0] = P.pts[i], [x1, z1] = P.pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(box(len + 0.4, 0.5, 0.8), M.stoneDark);
    m.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    m.receiveShadow = true;
    scene.add(m);
  }

  // 清漪亭：六角小亭立水中，周环太湖石、外绕绿水
  const Q = GARDEN.qingyi;
  const islet = new THREE.Mesh(new THREE.CylinderGeometry(Q.r, Q.r * 1.12, 0.5, 12), M.stone);
  islet.position.set(Q.x, 0.16, Q.z);
  islet.receiveShadow = true;
  group.add(islet);
  const ting = pavilion({ shape: 'hex', size: 3.0, height: 2.5, roofH: 1.4, posts: 6, terrace: 0.22 });
  ting.position.set(Q.x, 0.4, Q.z);
  group.add(ting);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rr(-0.2, 0.2);
    const rock = lakeRock(rr(0.4, 0.8), rr(0.9, 1.8));
    rock.position.set(Q.x + Math.cos(a) * (Q.r + 0.5), 0.1, Q.z + Math.sin(a) * (Q.r + 0.5));
    group.add(rock);
  }
  // 曲桥：三段条石折向亭子
  const bridge = [[10, 9], [6.5, 6.5], [3.2, 4.2]];
  for (let i = 0; i < bridge.length; i++) {
    const [x, z] = bridge[i];
    const nxt = bridge[i + 1] || [Q.x + 1.6, Q.z + 1.6];
    const len = Math.hypot(nxt[0] - x, nxt[1] - z);
    const slab = new THREE.Mesh(box(len, 0.2, 1.15), M.stoneDressed);
    slab.position.set((x + nxt[0]) / 2, 0.26, (z + nxt[1]) / 2);
    slab.rotation.y = -Math.atan2(nxt[1] - z, nxt[0] - x);
    slab.castShadow = true; slab.receiveShadow = true;
    group.add(slab);
    const rail = new THREE.Mesh(railingGeo(len - 0.3, { height: 0.5, spacing: 1.0 }), M.stone);
    rail.position.set(slab.position.x, 0.36, slab.position.z);
    rail.rotation.y = slab.rotation.y + Math.PI / 2;
    group.add(rail);
  }
  return {
    water, mat, sparkles,
    update(t) {
      for (const m of sparkles) {
        const u = m.userData;
        m.material.opacity = u.base * (0.55 + 0.45 * Math.sin(t * u.drift * 9 + u.ph));
        m.position.x = u.x0 + Math.sin(t * 0.09 + u.ph) * 0.7;
      }
    },
  };
}

/* ------------------------------------------------------------------ 配植 */

/** 本园的树按季分派：柏、松、枫、柳、桂、梅，各以一团皱面叶冠表示 */
export function treeOfKind(kind = 'camphor', trunkH = 3.6, crown = 2.4) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkH * 0.05, trunkH * 0.085, trunkH, 7), M.pillarDark);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  if (kind === 'willow') {
    const mat = lit('#4e7a5c', { rough: 0.95, side: THREE.DoubleSide });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, crown * 1.8, 3), mat);
      strand.position.set(Math.cos(a) * crown * 0.4, trunkH * 0.84 + crown * 0.5, Math.sin(a) * crown * 0.4);
      strand.rotation.set(Math.sin(a) * 0.26, 0, -Math.cos(a) * 0.26);
      group.add(strand);
    }
    return group;
  }
  const colors = {
    pine: '#2f5a44', camphor: PAL.camphor, maple: '#8c3f22',
    osmanthus: '#3c6b4e', plum: PAL.plum, cypress: '#2c4f3d',
  };
  const mat = lit(colors[kind] || PAL.camphor, { rough: 0.95, side: THREE.DoubleSide });
  const tall = kind === 'pine' || kind === 'cypress';
  for (let i = 0; i < (tall ? 4 : 3); i++) {
    const g = new THREE.IcosahedronGeometry(crown * rr(0.5, 0.86), 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) p.setY(v, p.getY(v) * (tall ? 1.5 : 0.72));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, kind === 'plum' ? M.plumBlossom : mat);
    m.position.set(rr(-1, 1) * crown * 0.42, trunkH + rr(-0.1, 0.5) * crown, rr(-1, 1) * crown * 0.42);
    m.castShadow = true;
    group.add(m);
  }
  if (kind === 'maple') {
    const warm = lit('#b0512a', { rough: 0.95, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(crown * rr(0.3, 0.5), 0), warm);
      m.position.set(rr(-1, 1) * crown * 0.6, trunkH + rr(0, 0.7) * crown, rr(-1, 1) * crown * 0.6);
      group.add(m);
    }
  }
  if (kind === 'osmanthus') {
    for (let i = 0; i < 34; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), glow('#f4e3a8', 0.7));
      f.position.set(rr(-1, 1) * crown * 0.8, trunkH * rr(0.8, 1.2) + rr(-1, 1) * crown * 0.5, rr(-1, 1) * crown * 0.8);
      group.add(f);
    }
  }
  return group;
}

function conifer(h = 4.2, r = 1.2) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.06, h * 0.5, 6), M.pillarDark);
  trunk.position.y = h * 0.25;
  group.add(trunk);
  const mat = lit('#2c4f3d', { rough: 0.95, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * (1 - k * 0.55), h * 0.34, 8), mat);
    cone.position.y = h * 0.42 + k * h * 0.46;
    cone.castShadow = true;
    group.add(cone);
  }
  return group;
}

/* ------------------------------------------------------------------ assemble */

export function buildGarden(scene) {
  const group = new THREE.Group();
  group.name = 'ge-garden';

  const ground = buildGround(scene);
  const walls = buildWalls(scene);
  const house = buildHouse(scene);
  const pond = buildPond(scene, group);

  // 宜雨轩：东阔三楹、四面虚窗，坐在水池南岸
  const Y = GARDEN.yuxuan;
  const yuxuan = hall({
    w: Y.w, d: Y.d, wallH: 4.2, baysX: 3, baysZ: 2, roofH: 2.7,
    openFront: true, openBack: true, openSides: true, plaque: '宜雨轩',
  });
  yuxuan.position.set(Y.x, 0, Y.z);
  group.add(yuxuan);
  for (const s of [-1, 1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.66, 12), M.stoneDressed);
    drum.position.set(Y.x + s * (Y.w / 2 - 1.2), 0.33, Y.z + Y.d / 2 + 1.5);
    drum.castShadow = true;
    group.add(drum);
  }

  // 透风漏月厅：面冬山而筑、南北通透、单檐硬山
  const L = GARDEN.louyue;
  const louyue = hall({
    w: L.w, d: L.d, wallH: 3.8, baysX: 3, baysZ: 2, roofH: 2.2,
    openFront: true, openBack: true, openSides: true, plaque: '透风漏月',
    roof: M.roofDark,
  });
  louyue.position.set(L.x, 0, L.z);
  group.add(louyue);

  // 抱山楼：池北七楹长楼，匾"壶天自春"
  const B = GARDEN.baoshan;
  const baoshan = storiedHall({ w: B.w, d: B.d, floors: 2, floorH: 3.5, roofH: 2.8, baysX: 6 });
  baoshan.position.set(B.x, 0, B.z);
  group.add(baoshan);
  const houtian = plaqueMesh('壶天自春', 3.2, 0.95);
  houtian.position.set(B.x, 4.0, B.z + B.d / 2 + 0.6);
  group.add(houtian);

  // 丛书楼：秋山南端，背依秋山、面南，三开间上下六间
  const C = GARDEN.congshu;
  const congshu = storiedHall({ w: C.w, d: C.d, floors: 2, floorH: 3.1, roofH: 2.3, baysX: 3 });
  congshu.position.set(C.x, 0, C.z);
  group.add(congshu);
  const csPlaque = plaqueMesh('丛书楼', 2.2, 0.72);
  csPlaque.position.set(C.x, 3.6, C.z + C.d / 2 + 0.55);
  group.add(csPlaque);

  // 长廊：夏山→抱山楼→秋山→石级→觅句廊→宜雨轩
  const west = corridorRun({
    pts: [[B.x - B.w / 2, B.z + 1.6], [-22, B.z - 1], [-36, -28], [-41, -20]],
    width: 2.6, height: 2.7, base: 0.02,
  });
  group.add(west.group);
  const east = corridorRun({
    pts: [[B.x + B.w / 2, B.z + 1.6], [26, B.z - 2], [43, -24], [45, 2], [30, 12], [Y.x + Y.w / 2 + 1.6, Y.z]],
    width: 2.6, height: 2.7, base: 0.02,
  });
  group.add(east.group);
  // 觅句廊：曲廊尽头一座小阁，袁枚那句就挂在这里
  const ge = storiedHall({ w: 7, d: 6, floors: 2, floorH: 3.0, roofH: 2.1, baysX: 2 });
  ge.position.set(45, 0, -10);
  group.add(ge);
  const mijun = plaqueMesh('觅句廊', 2.0, 0.66);
  mijun.position.set(44.4, 3.2, -6.6);
  mijun.rotation.y = -Math.PI / 2;
  group.add(mijun);
  const couplet = plaqueMesh('月映竹成千个字', 0.62, 3.4, { dir: 'v' });
  couplet.position.set(44.2, 2.2, -8.2);
  couplet.rotation.y = -Math.PI / 2;
  group.add(couplet);

  buildSpringHill(group);
  buildSummerHill(group);
  const autumn = buildAutumnHill(group);
  buildWinterHill(group);

  scene.add(group);

  return {
    group, ground, walls, house, pond,
    hills: { peak: autumn.peak },
    buildings: { yuxuan, louyue, baoshan, congshu },
    corridors: { west, east },
    anchors: {
      hill: {
        spring: [GARDEN.spring.cx, 2.4, GARDEN.spring.cz],
        summer: [GARDEN.summer.cx, GARDEN.summer.h * 0.72, GARDEN.summer.cz],
        autumn: [GARDEN.autumn.cx, GARDEN.autumn.h * 0.8, GARDEN.autumn.cz],
        winter: [GARDEN.winter.cx, GARDEN.winter.h * 0.6, GARDEN.winter.cz],
      },
      gate: [GARDEN.gate.x, 3.2, WZ1],
      lane: [HOUSE.lane.x, 4.2, HOUSE.lane.zFrom],
      baoshan: [B.x, 7.4, B.z + 5],
      yuxuan: [Y.x, 3.2, Y.z + Y.d / 2 + 2],
      louyue: [L.x, 3.0, L.z + L.d / 2 + 2],
      congshu: [C.x, 3.4, C.z + C.d / 2 + 1.6],
      pond: [GARDEN.pond.cx, 0.4, GARDEN.pond.cz],
      corridorWest: west.middles.map((m) => [m.x, 2.4, m.z]),
      corridorEast: east.middles.map((m) => [m.x, 2.4, m.z]),
      house: [0, 4.6, HOUSE.axis.ting.z],
      niche: [GARDEN.winter.nicheFrom + 8, 1.9, WZ1],
    },
    wallBounds: { x0: WX0, x1: WX1, z0: WZ0, z1: WZ1 },
  };
}
