import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  lit, glow, box, mesh, rand, rr, chineseRoof, ridgeOrnament, pillarGeo, railingGeo,
  plaqueMesh, registerOccluder, terraceGeo, stairsGeo, lanternGeo, windBellGeo, archFacade, M,
} from './kit.js';
import * as T from './textures.js';
import { terrainH } from './environment.js';
import { AXIS, TOWER, STAIR, WALK, YUDAI, PIER, CAUSEWAY, POOL, CAVES } from './layout.js';

/** 构建时回填，供 taling.js / portals.js / interiors.js / main.js 读 */
export const LAYOUT = {
  chime: { pos: new THREE.Vector3(), pivot: null, bells: [], faces: [] },
  tower: { pos: new THREE.Vector3(), top: 0, door: new THREE.Vector3() },
  hall: { door: new THREE.Vector3(), pos: new THREE.Vector3() },
  boat: { door: new THREE.Vector3() },
  stair: { curve: null },
  walk: { curve: null },
};

const group = () => new THREE.Group();
const Y_WEST = -Math.PI / 2;   // 正面朝西（−x）：山门与中轴四进都是这个朝向

/* ==================================================== 檐口灯带
 * 慈寿塔的轮廓灯属实，殿宇檐口那一线属写意——但两套都走同一批材质，
 * setEave() 一压就一起矮下去，波环扫过机位时才显得是同一座山在呼吸。
 */
const stripMats = [];
function eaveLine(parent, pts, color = '#ffc46a', hi = 1.5, radius = 0.07) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const g = new THREE.TubeGeometry(curve, Math.max(12, pts.length * 5), radius, 5, false);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(hi) });
  mat.toneMapped = false; mat.fog = false;
  stripMats.push({ mat, base: mat.color.clone() });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 8;
  parent.add(m);
  return m;
}
function setEave(f) {
  for (const s of stripMats) s.mat.color.copy(s.base).multiplyScalar(f);
}

/* ==================================================== 八角屋面 */
function octRoof({ Rc, height, curve = 0.62, lift = 0.55, overhang = 0.4, top = 0.2, segA = 80, segR = 10 }) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;                                  // 0 顶心，1 檐口
    const s = t * (1 - curve) + Math.sqrt(t) * curve;    // 反曲：近脊陡、近檐缓
    const y = height * (1 - s);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const k = Math.round(a / (Math.PI / 4));
      const th = a - k * (Math.PI / 4);                  // 距这一面中心的角差
      const vN = Math.abs(th) / (Math.PI / 8);           // 0 面心，1 翼角
      const rr2 = (top + (1 - top) * t) * (Rc + overhang) * Math.cos(Math.PI / 8) / Math.cos(th);
      const kick = height * lift * 0.42 * Math.pow(vN, 2.2) * Math.pow(t, 1.3) + height * 0.1 * Math.pow(t, 5);
      pos.push(Math.cos(a) * rr2, y + kick, Math.sin(a) * rr2);
      uv.push(a * 1.8, t * 1.4);
    }
  }
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ==================================================== 慈寿塔
 * 砖木结构、八面七级，清光绪二十六年（1900）重建，高约三十米，内设旋式木梯可登。
 * 每级每面都挂风铎：56 个铃按面分组，塔铃报一响就点亮一面的八分之一的檐。
 */
function pagoda(parent, anchors) {
  const grp = group();
  const g = terrainH(TOWER.x, TOWER.z);
  grp.position.set(TOWER.x, g, TOWER.z);

  const tiers = TOWER.tiers;              // 7
  const faces = TOWER.faces;              // 8
  const bodyMat = M.brick;
  const roofMat = M.roofTower;
  const ridgeMat = lit('#454b58', { rough: 0.82 });

  // 一面的面光材质共用，撞这一面时整面一起亮
  const faceMats = [];
  for (let i = 0; i < faces; i++) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd76a').multiplyScalar(0.5) });
    m.toneMapped = false; m.fog = false; m.transparent = true; m.opacity = 0.9;
    m.userData.base = new THREE.Color('#ffd76a');
    faceMats.push(m);
    LAYOUT.chime.faces.push(m);
  }

  const parts = [];
  let y = 0;
  const R0 = 7.4;
  for (let i = 0; i < tiers; i++) {
    const Rc = R0 - i * 0.72;
    const bh = i === 0 ? 5.4 : 4.0;
    // 塔身：八棱柱
    parts.push(new THREE.CylinderGeometry(Rc * 0.96, Rc, bh, 8, 1).translate(0, y + bh / 2, 0));
    // 平座（每级挑出的八角腰檐台）
    parts.push(new THREE.CylinderGeometry(Rc + 1.5, Rc + 1.4, 0.3, 8, 1).translate(0, y + 0.15, 0));
    y += bh;
    const roof = new THREE.Mesh(octRoof({ Rc, height: 2.5 - i * 0.09, lift: 0.68, overhang: 0.9, top: 0.24, segA: 72, segR: 9 }), roofMat);
    roof.position.y = y;
    roof.castShadow = true;
    grp.add(roof);
    // 檐口轮廓灯：沿八边形的檐线走一圈
    const eavePts = [];
    for (let k = 0; k <= faces; k++) {
      const a = (k / faces) * Math.PI * 2 + Math.PI / 8;
      const rr2 = (Rc + 0.9) * 1.0;
      eavePts.push([Math.cos(a) * rr2, y - 0.16, Math.sin(a) * rr2]);
    }
    eaveLine(grp, eavePts, '#ffd07a', 1.15, 0.05);
    // 面光片：一面一块，报这一面时整块亮起
    for (let k = 0; k < faces; k++) {
      const a = (k / faces) * Math.PI * 2;                       // 面心方向
      const w = 2 * Rc * Math.tan(Math.PI / 8) * 0.56;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, bh * 0.5), faceMats[k]);
      panel.position.set(Math.cos(a) * (Rc + 0.08), y - bh * 0.3, Math.sin(a) * (Rc + 0.08));
      panel.rotation.y = -a + Math.PI / 2;
      panel.renderOrder = 9;
      panel.userData.face = k;
      grp.add(panel);
      // 翼角下的风铎：每面一枚，挂在檐角
      for (const s of [-1, 1]) {
        const av = a + s * (Math.PI / 8);
        const bell = mesh(windBellGeo({ height: 0.62, radius: 0.22 }), M.bronze);
        const rr2 = (Rc + 0.86) * 1.02;
        bell.position.set(Math.cos(av) * rr2, y - 0.62, Math.sin(av) * rr2);
        grp.add(bell);
        LAYOUT.chime.bells.push({ mesh: bell, face: k, tier: i, phase: rand() * 6.28, pos: bell.position.clone() });
      }
    }
    // 每级的栏板（简化的八角勾栏）
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(Rc + 1.42, Rc + 1.42, 0.9, 8, 1, true),
      lit('#dfe4ec', { map: T.stone('#c8ced8'), rough: 0.88, side: THREE.DoubleSide, emissive: '#1b2029', ei: 0.5 }));
    rail.position.y = y + 0.6;
    grp.add(rail);
    // 面上的格扇窗（隔层设券门，暗层不开窗）
    for (let k = 0; k < faces; k += 2) {
      const a = (k / faces) * Math.PI * 2;
      const lat = new THREE.Mesh(new THREE.PlaneGeometry(w0(Rc) * 0.5, bh * 0.44), M.lattice);
      lat.position.set(Math.cos(a) * (Rc * 0.96 + 0.06), y - bh * 0.42, Math.sin(a) * (Rc * 0.96 + 0.06));
      lat.rotation.y = -a + Math.PI / 2;
      grp.add(lat);
    }
  }
  grp.add(mesh(parts, bodyMat));

  // 塔刹
  const spire = [];
  spire.push(new THREE.CylinderGeometry(0.14, 0.26, 3.6, 8).translate(0, y + 2.0, 0));
  for (let i = 0; i < 5; i++) spire.push(new THREE.TorusGeometry(0.62 - i * 0.09, 0.075, 6, 14).rotateX(Math.PI / 2).translate(0, y + 0.7 + i * 0.6, 0));
  spire.push(new THREE.SphereGeometry(0.42, 10, 8).translate(0, y + 4.0, 0));
  const spireMesh = mesh(spire, M.gilt);
  grp.add(spireMesh);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), glow('#ffe6b0', 2.8));
  finial.position.y = y + 4.0;
  grp.add(finial);
  anchors.towerTop = new THREE.Vector3(TOWER.x, g + y + 4, TOWER.z);

  // 塔基与登塔券门
  grp.add(mesh([
    new THREE.CylinderGeometry(R0 + 2.6, R0 + 3.0, 1.8, 8).translate(0, -0.9, 0),
    new THREE.CylinderGeometry(R0 + 3.2, R0 + 3.4, 0.5, 8).translate(0, -1.9, 0),
  ], lit('#c7ccd6', { map: T.stone('#adb3bf'), rough: 0.9 })));
  const front = -1;                                    // 门朝西
  const doorZ = front * (R0 + 0.2);
  const door = mesh([
    box(3.2, 5.0, 1.2, 0, 2.5, doorZ),
    box(4.2, 0.6, 1.5, 0, 5.4, doorZ),
  ], lit('#2f2118', { map: T.wood('#241a12', '#100a06'), rough: 0.82 }));
  grp.add(door);
  const plaque = plaqueMesh('慈寿塔', 4.0, 1.4, { bg: '#132a44' });
  plaque.position.set(0, 5.9, doorZ - 0.7);
  plaque.rotation.y = Math.PI;
  grp.add(plaque);
  for (const s of [-1, 1]) {
    const lam = new THREE.Mesh(lanternGeo(0.36, 0.5), glow('#ffb063', 1.5));
    lam.position.set(s * 3.0, 3.2, doorZ - 0.9);
    grp.add(lam);
  }

  LAYOUT.tower.pos.set(TOWER.x, g, TOWER.z);
  LAYOUT.tower.top = g + y + 4.0;
  LAYOUT.tower.door.set(TOWER.x, g + 2.5, TOWER.z + doorZ - 0.4);
  registerOccluder(door, 2.6, new THREE.Vector3(TOWER.x, g + 2.5, TOWER.z + doorZ));
  parent.add(grp);
  return { group: grp, faceMats, y, g, spire };
}
const w0 = (Rc) => 2 * Rc * Math.tan(Math.PI / 8);

/* ==================================================== 塔顶铃架
 * 江风过塔，最先动的是这一架：悬在刹下的一具风铃与一根摆锤。
 */
function windFrame(tower) {
  const grp = group();
  const y = LAYOUT.tower.top - 4.6;
  grp.position.set(TOWER.x, y, TOWER.z);
  const frame = [];
  for (const s of [-1, 1]) frame.push(box(0.26, 2.6, 0.26, s * 2.1, 1.3, 0));
  frame.push(box(4.6, 0.26, 0.26, 0, 2.6, 0));
  grp.add(mesh(frame, lit('#4a3320', { map: T.wood('#38251a', '#180e07'), rough: 0.8 })));
  const bells = [];
  for (let i = 0; i < 8; i++) {
    const b = mesh(windBellGeo({ height: 0.9, radius: 0.3 }), M.bronze);
    b.position.set(-1.9 + i * 0.55, 1.9, (i % 2 ? -0.42 : 0.42));
    grp.add(b);
    bells.push(b);
    LAYOUT.chime.bells.push({ mesh: b, face: i % 8, tier: 7, phase: rand() * 6.28, pos: b.position.clone() });
  }
  const pivot = group();
  const clapper = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6), lit('#3a2a1c', { rough: 0.8 }));
  clapper.position.y = -1.05;
  const head = mesh(new THREE.SphereGeometry(0.24, 10, 8), lit('#b8453a', { rough: 0.6 }));
  head.position.y = -2.05;
  pivot.add(clapper, head);
  pivot.position.set(0, 2.5, 0.5);
  grp.add(pivot);
  LAYOUT.chime.pos.set(TOWER.x, tower.g + 1.8, TOWER.z);
  LAYOUT.chime.pivot = pivot;
  tower.group.add(grp);
  // 铃架挂在塔组之下，位置要换算成局部高程
  grp.position.set(0, y - tower.g, 0);
  return { group: grp, pos: LAYOUT.chime.pos, pivot, bells, faces: tower.faceMats };
}

/* ==================================================== 殿 / 阁 / 楼
 * 正面在局部 +z，靠 yaw 转到实景朝向（中轴四进都朝西）。
 */
function hall(parent, spec) {
  const { x, z, w, d, h = 7, stories = 1, yaw = Y_WEST, name, roofColor = M.roofTemple, colonnade = true } = spec;
  const g = terrainH(x, z);
  const grp = group();
  grp.position.set(x, g, z);
  grp.rotation.y = yaw;

  const bodyH = stories === 2 ? h * 0.56 : h;
  const upH = stories === 2 ? h * 0.5 : 0;

  // 台基 + 前踏道
  const baseH = 1.5 + (stories - 1) * 0.4;
  grp.add(mesh(terraceGeo({ width: w + 6, depth: d + 6, height: baseH }),
    lit('#d3d8e2', { map: T.stone('#c2c8d2'), rough: 0.9 })));
  const steps = mesh(stairsGeo(w * 0.5, baseH, 4.6, 11),
    lit('#ccd2dc', { map: T.paving(), rough: 0.9 }));
  steps.position.set(0, 0, d / 2 + 5.2);
  grp.add(steps);
  for (const s of [-1, 1]) {
    const rail = mesh(railingGeo(4.8, { height: 0.95, spacing: 0.9 }), M.marble);
    rail.position.set(s * (w * 0.25 + 0.6), baseH * 0.5, d / 2 + 5.4);
    rail.rotation.y = Math.PI / 2;
    grp.add(rail);
  }
  // 月台栏板
  for (const s of [-1, 1]) {
    const rail = mesh(railingGeo(d + 6, { height: 1.0, spacing: 1.4 }), M.marble);
    rail.position.set(s * (w / 2 + 2.4), baseH + 0.5, 0);
    rail.rotation.y = Math.PI / 2;
    grp.add(rail);
  }

  const wallMat = M.wall;
  const bodies = [];
  bodies.push(box(w, bodyH, d, 0, baseH + bodyH / 2, 0));
  grp.add(mesh(bodies, wallMat));

  // 檐柱与副阶：寺裹山的正面永远是柱子排成一圈
  if (colonnade) {
    const n = Math.max(3, Math.round(w / 3.4));
    for (let i = 0; i <= n; i++) {
      const px = -w / 2 + (w * i) / n;
      for (const s of [1, -1]) {
        const p = mesh(pillarGeo(bodyH * 0.94, 0.32), M.vermilion);
        p.position.set(px, baseH + bodyH * 0.47, s * (d / 2 + 1.15));
        grp.add(p);
      }
    }
    const eaveFloor = mesh(box(w + 2.6, 0.24, 2.4, 0, baseH + 0.12, d / 2 + 1.2),
      lit('#c9ced8', { map: T.paving(), rough: 0.9 }));
    grp.add(eaveFloor);
  }

  // 墙上的格扇：正面开门，两侧与背面开窗
  const doorW = Math.min(4.6, w * 0.26), doorH = bodyH * 0.72;
  const door = mesh([
    box(doorW, doorH, 0.5, 0, baseH + doorH / 2, d / 2 + 0.1),
    box(doorW + 0.9, 0.55, 0.7, 0, baseH + doorH + 0.2, d / 2 + 0.1),
  ], lit('#3a221a', { map: T.wood('#2a1811', '#150c07'), rough: 0.8 }));
  grp.add(door);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const lat = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.2, bodyH * 0.5), M.lattice);
      lat.position.set(s * (w * 0.3 + i * w * 0.16), baseH + bodyH * 0.55, d / 2 + 0.16);
      grp.add(lat);
      const lat2 = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.3, bodyH * 0.46), M.lattice);
      lat2.position.set(s * (w / 2 + 0.16), baseH + bodyH * 0.55, -d * 0.1 + i * d * 0.36);
      lat2.rotation.y = s * Math.PI / 2;
      grp.add(lat2);
    }
  }

  // 屋顶（上下两层的楼阁就是同一套构件再叠一遍）
  const mk = (yBase, ww, dd, hh) => {
    const roof = new THREE.Mesh(chineseRoof({
      width: ww, depth: dd, height: hh, ridgeRatio: 0.34, curve: 0.64,
      eaveLift: 0.66, overhang: 0.85, segU: 26, segV: 16,
    }), roofColor);
    roof.position.y = yBase;
    roof.castShadow = true;
    grp.add(roof);
    const ridge = mesh(ridgeOrnament({ width: ww, depth: dd, height: hh, ridgeRatio: 0.34, overhang: 0.85 }),
      lit('#454b58', { rough: 0.82 }));
    ridge.position.y = yBase;
    grp.add(ridge);
    // 檐口灯带：四面檐线各一条
    const hw = ww / 2 + 0.85, hd = dd / 2 + 0.85;
    const yEave = yBase - 0.18;
    eaveLine(grp, [[-hw, yEave, hd], [0, yEave, hd + 0.05], [hw, yEave, hd]], '#ffc46a', 1.5, 0.07);
    eaveLine(grp, [[-hw, yEave, -hd], [0, yEave, -hd - 0.05], [hw, yEave, -hd]], '#ffc46a', 1.4, 0.06);
    for (const s of [-1, 1]) {
      eaveLine(grp, [[s * hw, yEave, -hd], [s * hw, yEave, 0], [s * hw, yEave, hd]], '#ffc46a', 1.35, 0.06);
    }
    return roof;
  };
  let yTop = mk(baseH + bodyH, w + 1.6, d + 1.6, bodyH * 0.44);
  if (stories === 2) {
    grp.add(mesh(box(w * 0.86, upH, d * 0.86, 0, baseH + bodyH + upH * 0.5, 0), wallMat));
    const flat = mesh(box(w + 1.2, 0.4, d + 1.2, 0, baseH + bodyH + 0.2, 0), M.marble);
    grp.add(flat);
    yTop = mk(baseH + bodyH + upH, w * 0.9, d * 0.9, upH * 0.46);
  }
  void yTop;

  // 匾与灯
  if (name) {
    const pq = plaqueMesh(name, Math.min(5.4, w * 0.4), 1.5, { bg: '#123057' });
    pq.position.set(0, baseH + doorH + 1.15, d / 2 + 0.6);
    grp.add(pq);
  }
  for (const s of [-1, 1]) {
    const lam = new THREE.Mesh(lanternGeo(0.42, 0.6), glow('#ff9f57', 1.6));
    lam.position.set(s * doorW * 1.25, baseH + doorH * 0.86, d / 2 + 1.5);
    grp.add(lam);
  }
  // 廊下挂灯一串
  const nL = Math.max(2, Math.round(w / 4));
  for (let i = 0; i < nL; i++) {
    const px = -w / 2 + (w * (i + 0.5)) / nL;
    const lam = new THREE.Mesh(lanternGeo(0.3, 0.44), glow('#ffb063', 1.35));
    lam.position.set(px, baseH + bodyH * 0.82, d / 2 + 1.9);
    grp.add(lam);
  }

  // 殿前一盏跟手的暖光，夜里保住柱子的颜色
  const pl = new THREE.PointLight(0xffb066, 30, 42, 2);
  pl.position.set(0, baseH + bodyH * 0.6, d / 2 + 4);
  grp.add(pl);

  // 门前地坪与月台石板
  const plaza = mesh(box(w + 8, 0.22, d + 12, 0, baseH + 0.11, 0),
    lit('#c3c9d4', { map: T.paving(), rough: 0.92 }));
  grp.add(plaza);

  parent.add(grp);
  const doorWorld = new THREE.Vector3(0, baseH + doorH / 2, d / 2 + 0.6)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .add(new THREE.Vector3(x, g, z));
  return { group: grp, door: doorWorld, baseH, bodyH, light: pl };
}

/* ==================================================== 山顶的亭与台 */
function pavilion(parent, { x, z, R = 4.4, h = 4.2, name }) {
  const g = terrainH(x, z);
  const grp = group();
  grp.position.set(x, g, z);
  grp.add(mesh([
    new THREE.CylinderGeometry(R + 1.5, R + 1.7, 0.9, 6).translate(0, 0.45, 0),
    new THREE.CylinderGeometry(R + 2.1, R + 2.2, 0.3, 6).translate(0, -0.15, 0),
  ], lit('#d0d6e0', { map: T.stone('#bec4ce'), rough: 0.9 })));
  const pil = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283;
    pil.push(new THREE.CylinderGeometry(0.17, 0.19, h, 9).translate(Math.cos(a) * (R - 0.2), 0.9 + h / 2, Math.sin(a) * (R - 0.2)));
  }
  grp.add(mesh(pil, M.vermilion));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283;
    const rail = mesh(railingGeo(2 * (R - 0.2) * Math.sin(Math.PI / 6) * 0.94, { height: 0.9, spacing: 0.8 }), M.marble);
    rail.position.set(Math.cos(a + Math.PI / 6) * (R - 0.2) * Math.cos(Math.PI / 6), 1.2, Math.sin(a + Math.PI / 6) * (R - 0.2) * Math.cos(Math.PI / 6));
    rail.rotation.y = -a - Math.PI / 6 + Math.PI / 2;
    grp.add(rail);
  }
  // 攒尖顶
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 1.5, h * 0.62, 6), M.roofTemple);
  roof.position.y = 0.9 + h + h * 0.31;
  roof.rotation.y = Math.PI / 6;
  roof.castShadow = true;
  grp.add(roof);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), M.gilt);
  top.position.y = 0.9 + h + h * 0.64;
  grp.add(top);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283 + Math.PI / 6;
    const rr2 = R + 1.1;
    eaveLine(grp, [
      [Math.cos(a - 0.32) * rr2 * 0.72, 0.9 + h + h * 0.1, Math.sin(a - 0.32) * rr2 * 0.72],
      [Math.cos(a) * rr2, 0.9 + h - 0.1, Math.sin(a) * rr2],
    ], '#ffd07a', 1.4, 0.06);
  }
  // 亭内的「江天一览」碑
  const stele = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.3),
    new THREE.MeshBasicMaterial({ map: T.jiangtianStele(), toneMapped: false }));
  stele.position.set(0, 2.5, -0.6);
  grp.add(stele);
  const steleBack = new THREE.Mesh(box(2.5, 3.6, 0.5, 0, 2.5, -0.9), lit('#7f8794', { map: T.stone('#6d7480'), rough: 0.92 }));
  grp.add(steleBack);
  if (name) {
    const pq = plaqueMesh(name, 3.6, 1.2, { bg: '#132a44' });
    pq.position.set(0, 0.9 + h * 0.86, R - 0.1);
    grp.add(pq);
  }
  const lamp = new THREE.Mesh(lanternGeo(0.36, 0.5), glow('#ffcf8a', 1.7));
  lamp.position.set(0, 0.9 + h * 0.7, 0);
  grp.add(lamp);
  const pl = new THREE.PointLight(0xffc884, 18, 30, 2);
  pl.position.set(0, 2.6, 1.2);
  grp.add(pl);
  parent.add(grp);
  return grp;
}

/** 妙高台：山顶的一方坪，四角立柱与栏板，只留一盏灯 */
function terrace(parent, { x, z, w, d, name }) {
  const g = terrainH(x, z);
  const grp = group();
  grp.position.set(x, g, z);
  grp.add(mesh([
    box(w, 1.4, d, 0, 0.7, 0),
    box(w + 1.2, 0.3, d + 1.2, 0, -0.15, 0),
  ], lit('#cfd5df', { map: T.stone('#bdc3cd'), rough: 0.9 })));
  for (const sx of [-1, 1]) {
    const rail = mesh(railingGeo(d, { height: 1.05, spacing: 1.3 }), M.marble);
    rail.position.set(sx * (w / 2 + 0.4), 1.4, 0);
    rail.rotation.y = Math.PI / 2;
    grp.add(rail);
  }
  for (const sz of [-1, 1]) {
    const rail = mesh(railingGeo(w, { height: 1.05, spacing: 1.3 }), M.marble);
    rail.position.set(0, 1.4, sz * (d / 2 + 0.4));
    grp.add(rail);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = mesh(pillarGeo(4.4, 0.24), M.vermilion);
    p.position.set(sx * (w / 2 - 0.6), 1.4, sz * (d / 2 - 0.6));
    grp.add(p);
    const lam = new THREE.Mesh(lanternGeo(0.3, 0.42), glow('#ffb063', 1.4));
    lam.position.set(sx * (w / 2 - 0.6), 5.6, sz * (d / 2 - 0.6));
    grp.add(lam);
  }
  if (name) {
    const pq = plaqueMesh(name, 3.4, 1.2, { dir: 'v', bg: '#123057' });
    pq.position.set(0, 2.6, d / 2 + 0.2);
    grp.add(pq);
  }
  parent.add(grp);
  return grp;
}

/* ==================================================== 山门牌楼（四柱三门，朝西） */
function gateway(parent) {
  const { x, z } = AXIS.gate;
  const g = terrainH(x, z);
  const grp = group();
  grp.position.set(x, g, z);
  grp.rotation.y = Y_WEST;
  const spanW = 15, colH = 8.2;
  const cols = [];
  for (const s of [-1, 1]) {
    const px = s * spanW / 2;
    cols.push(box(1.3, colH, 1.3, px, colH / 2, 0));
    cols.push(box(2.1, 0.8, 2.1, px, 0.4, 0));
    cols.push(box(1.7, 0.5, 1.7, px, colH + 0.3, 0));
    // 抱鼓石
    cols.push(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 12).rotateX(Math.PI / 2).translate(px + s * 1.6, 0.9, 1.2));
  }
  for (const s of [-1, 1]) {
    const px = s * spanW * 0.2;
    cols.push(box(1.1, colH * 0.82, 1.1, px, colH * 0.41, 0));
    cols.push(box(1.8, 0.7, 1.8, px, 0.35, 0));
  }
  grp.add(mesh(cols, lit('#c4cad4', { map: T.stone('#b2b8c2'), rough: 0.92 })));
  // 三道额枋
  const beams = [];
  beams.push(box(spanW + 2.2, 0.8, 1.1, 0, colH, 0));
  beams.push(box(spanW * 0.44 + 2, 0.7, 1.0, 0, colH * 0.84, 0));
  for (const s of [-1, 1]) beams.push(box(spanW * 0.26 + 1.6, 0.66, 1.0, s * spanW * 0.34, colH * 0.72, 0));
  grp.add(mesh(beams, lit('#8e2f24', { map: T.wood('#6d2a20', '#31100a'), rough: 0.74 })));
  // 楼顶：中门一座较高的歇山，两侧各一座矮的
  const mid = new THREE.Mesh(chineseRoof({ width: 7.2, depth: 3.2, height: 2.0, ridgeRatio: 0.3, curve: 0.72, eaveLift: 0.8, overhang: 0.6, segU: 22, segV: 12 }), M.roofTemple);
  mid.position.set(0, colH + 0.7, 0);
  mid.castShadow = true;
  grp.add(mid);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(chineseRoof({ width: 5.2, depth: 2.6, height: 1.5, ridgeRatio: 0.32, curve: 0.74, eaveLift: 0.85, overhang: 0.5, segU: 18, segV: 10 }), M.roofTemple);
    side.position.set(s * spanW / 2, colH - 0.4, 0);
    grp.add(side);
    const small = new THREE.Mesh(chineseRoof({ width: 4.2, depth: 2.2, height: 1.3, ridgeRatio: 0.34, curve: 0.74, eaveLift: 0.85, overhang: 0.45, segU: 16, segV: 9 }), M.roofTemple);
    small.position.set(s * spanW * 0.34, colH * 0.84 + 0.6, 0);
    grp.add(small);
  }
  // 匾：牌楼正面「江天禅寺」，是清康熙御题的那四个字
  const front = plaqueMesh('江天禅寺', 5.2, 1.7, { bg: '#10263f', border: '#d8ab63' });
  front.position.set(0, colH - 0.9, 1.0);
  grp.add(front);
  // 门灯与檐下灯带
  for (const s of [-1, 1]) {
    const lam = new THREE.Mesh(lanternGeo(0.5, 0.7), glow('#ff9f57', 1.7));
    lam.position.set(s * 2.4, colH * 0.62, 0);
    grp.add(lam);
  }
  eaveLine(grp, [[-3.6, colH + 0.55, 1.7], [0, colH + 2.5, 1.8], [3.6, colH + 0.55, 1.7]], '#ffc46a', 1.5, 0.07);
  eaveLine(grp, [[-3.6, colH + 0.55, -1.7], [0, colH + 2.5, -1.8], [3.6, colH + 0.55, -1.7]], '#ffc46a', 1.4, 0.06);
  const pl = new THREE.PointLight(0xff9a52, 26, 40, 2);
  pl.position.set(0, colH * 0.55, 2.4);
  grp.add(pl);
  parent.add(grp);
  return { group: grp, pos: new THREE.Vector3(x, g, z), yaw: Y_WEST };
}

/* ==================================================== 登临蹬道 */
function stairway(parent, anchors) {
  const pts = STAIR.pts.map(([x, z], i) => new THREE.Vector3(x, STAIR.y[i], z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  const S = 220;
  const sp = curve.getSpacedPoints(S);
  const hw = STAIR.width / 2;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    const sx = -tan.z, sz = tan.x;
    pos.push(sp[i].x - sx * hw, sp[i].y, sp[i].z - sz * hw);
    pos.push(sp[i].x + sx * hw, sp[i].y, sp[i].z + sz * hw);
    uv.push(0, i * 0.5, 1, i * 0.5);
    if (i < S) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const walk = new THREE.Mesh(g, lit('#ccd1db', { map: T.paving(), rough: 0.9, side: THREE.DoubleSide, emissive: '#141821', ei: 0.5 }));
  walk.receiveShadow = true;
  parent.add(walk);
  // 台阶：横向的条石凸棱，一级一级数得出来
  const treadN = 118;
  const tread = new THREE.InstancedMesh(box(STAIR.width, 0.16, 0.5, 0, 0, 0),
    lit('#d7dce6', { map: T.stone('#c6ccd6'), rough: 0.88 }), treadN);
  const d = new THREE.Object3D();
  for (let i = 0; i < treadN; i++) {
    const f = i / (treadN - 1);
    const p = curve.getPoint(f);
    const tan = curve.getTangent(f).setY(0).normalize();
    d.position.set(p.x, p.y + 0.08, p.z);
    d.rotation.set(0, Math.atan2(tan.x, tan.z), 0);
    d.scale.set(1, 1, 1); d.updateMatrix();
    tread.setMatrixAt(i, d.matrix);
  }
  parent.add(tread);
  // 两侧栏板与阶前灯
  for (const s of [-1, 1]) {
    const railPos = [], railIdx = [];
    for (let i = 0; i <= S; i += 2) {
      const tan = curve.getTangent(i / S).setY(0).normalize();
      const sx = -tan.z, sz = tan.x;
      const x = sp[i].x + sx * (hw + 0.22) * s, z = sp[i].z + sz * (hw + 0.22) * s;
      railPos.push(x, sp[i].y + 1.0, z);
      railPos.push(x, sp[i].y + 0.24, z);
    }
    const n = railPos.length / 6;
    for (let i = 0; i < n - 1; i++) {
      const v = i * 2, q = (i + 1) * 2;
      railIdx.push(v, v + 1, q, q, v + 1, q + 1);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
    rg.setIndex(railIdx); rg.computeVertexNormals();
    parent.add(new THREE.Mesh(rg, lit('#d5dae4', { rough: 0.9, side: THREE.DoubleSide, emissive: '#171c26', ei: 0.5 })));
  }
  const lampGeo = lanternGeo(0.2, 0.28);
  const stickGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.3, 6);
  const lampAt = [];
  for (let i = 8; i < S; i += 13) lampAt.push(i);
  const lamps = new THREE.InstancedMesh(lampGeo, glow('#ffbe72', 1.6), lampAt.length * 2);
  const sticks = new THREE.InstancedMesh(stickGeo, lit('#4a4238', { rough: 0.8 }), lampAt.length * 2);
  let li = 0;
  for (const i of lampAt) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    for (const s of [-1, 1]) {
      const x = sp[i].x - tan.z * (hw + 0.5) * s, z = sp[i].z + tan.x * (hw + 0.5) * s;
      d.rotation.set(0, 0, 0); d.scale.setScalar(1);
      d.position.set(x, sp[i].y + 1.6, z); d.updateMatrix(); lamps.setMatrixAt(li, d.matrix);
      d.position.set(x, sp[i].y + 0.8, z); d.updateMatrix(); sticks.setMatrixAt(li, d.matrix);
      li++;
    }
  }
  lamps.count = sticks.count = li;
  parent.add(lamps, sticks);
  LAYOUT.stair.curve = curve;
  anchors.crowdPaths.push(curve.getSpacedPoints(60));
  return { curve, lamps };
}

/* ==================================================== 绕山复道（寺裹山的外皮） */
function gallery(parent, anchors) {
  const pts = WALK.pts.map(([x, z]) => new THREE.Vector3(x, terrainH(x, z) + 0.5, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const S = 300;
  const sp = curve.getSpacedPoints(S);
  const hw = WALK.band / 2;
  const pos = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    const sx = -tan.z, sz = tan.x;
    pos.push(sp[i].x - sx * hw, sp[i].y, sp[i].z - sz * hw);
    pos.push(sp[i].x + sx * hw, sp[i].y, sp[i].z + sz * hw);
    if (i < S) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  parent.add(new THREE.Mesh(g, lit('#c5cbd6', { map: T.planks(), rough: 0.9, side: THREE.DoubleSide, emissive: '#12161d', ei: 0.5 })));
  // 单坡廊顶 + 立柱：一面贴崖、一面挑出去
  const roofPos = [], roofIdx = [];
  const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.17, 3.1, 7), M.vermilion, Math.ceil(S / 8));
  const d = new THREE.Object3D();
  let ci = 0;
  for (let i = 0; i <= S; i += 3) {
    const f = i / S;
    const tan = curve.getTangent(f).setY(0).normalize();
    const sx = -tan.z, sz = tan.x;
    const inner = 0.42, outer = hw + 0.65;
    const yb = sp[i].y, yr = sp[i].y + 3.2;
    roofPos.push(sp[i].x + sx * inner * -1, yr, sp[i].z + sz * inner * -1);
    roofPos.push(sp[i].x + sx * outer, yr - 0.9, sp[i].z + sz * outer);
    if (i < S) { const a = (i / 3) * 2, b = a + 2; roofIdx.push(a, a + 1, b, b, a + 1, b + 1); }
    if (i % 24 === 0 && ci < cols.count) {
      d.position.set(sp[i].x + sx * outer * 0.82, yb + 1.55, sp[i].z + sz * outer * 0.82);
      d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix();
      cols.setMatrixAt(ci++, d.matrix);
    }
  }
  cols.count = ci;
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  rg.setIndex(roofIdx); rg.computeVertexNormals();
  const roof = new THREE.Mesh(rg, lit('#9aa1ae', { map: T.roofTiles('#2f3442', '#454c5e', '#6f7b90'), rough: 0.85, side: THREE.DoubleSide }));
  roof.castShadow = true;
  parent.add(roof, cols);
  // 廊下一串挂灯
  const lampAt = [];
  for (let i = 10; i < S; i += 16) lampAt.push(i);
  const lamps = new THREE.InstancedMesh(lanternGeo(0.22, 0.3), glow('#ffb063', 1.5), lampAt.length);
  let li = 0;
  for (const i of lampAt) {
    const tan = curve.getTangent(i / S).setY(0).normalize();
    const x = sp[i].x - tan.z * 1.2, z = sp[i].z + tan.x * 1.2;
    d.rotation.set(0, 0, 0); d.scale.setScalar(1);
    d.position.set(x, sp[i].y + 2.7, z); d.updateMatrix(); lamps.setMatrixAt(li++, d.matrix);
  }
  lamps.count = li;
  parent.add(lamps);
  LAYOUT.walk.curve = curve;
  anchors.crowdPaths.push(curve.getSpacedPoints(70));
  return { curve, group: parent };
}

/* ==================================================== 崖洞 */
function cave(parent, { x, z, yaw, name, w = 3.4, h = 3.8 }) {
  const g = terrainH(x, z);
  const grp = group();
  grp.position.set(x, g, z);
  grp.rotation.y = yaw;
  grp.add(mesh(archFacade({ width: w + 4.4, height: h + 1.6, depth: 1.4, openW: w, openH: h }),
    lit('#9aa0ac', { map: T.brickWall('#6a6252', '#3a352c', '#8f8770'), rough: 0.95 })));
  // 洞口的暗膛与一盏洞灯
  const dark = new THREE.Mesh(box(w, h, 3.2, 0, h / 2, -1.8), lit('#05070c', { rough: 1, emissive: '#040609', ei: 0.4 }));
  grp.add(dark);
  const lamp = new THREE.Mesh(lanternGeo(0.3, 0.42), glow('#ffc47a', 1.9));
  lamp.position.set(0, h * 0.52, -1.1);
  grp.add(lamp);
  const pl = new THREE.PointLight(0xffb066, 16, 22, 2);
  pl.position.set(0, h * 0.6, -0.4);
  grp.add(pl);
  const pq = plaqueMesh(name, 2.8, 1.1, { bg: '#1a2a38' });
  pq.position.set(0, h + 0.9, 0.9);
  pq.rotation.y = Math.PI;
  grp.add(pq);
  // 崖面的乱石把洞口围起来
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.5, 0),
    lit('#6f7581', { map: T.stone('#5f6571'), rough: 0.96 }), 22);
  const d = new THREE.Object3D();
  for (let i = 0; i < 22; i++) {
    d.position.set(rr(-4.6, 4.6), rr(-0.4, h + 2.6), rr(-2.2, -0.2));
    d.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
    d.scale.setScalar(rr(0.5, 1.25));
    d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
  }
  grp.add(rocks);
  parent.add(grp);
  return grp;
}

/* ==================================================== 玉带桥 */
function yudaiBridge(parent, anchors) {
  const { x0, x1, z, rise, width } = YUDAI;
  const grp = group();
  const n = 60;
  const deckPos = [], idx = [];
  const half = width / 2;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = x0 + (x1 - x0) * f;
    const y = terrainH(x, z) + 0.6 + rise * Math.sin(f * Math.PI);
    deckPos.push(x, y, z - half);
    deckPos.push(x, y, z + half);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const deck = new THREE.Mesh(g, lit('#ccd2dc', { map: T.stone('#b9bfc9'), rough: 0.9, side: THREE.DoubleSide }));
  deck.receiveShadow = true;
  grp.add(deck);
  for (const s of [-1, 1]) {
    const railPos = [], railIdx = [];
    for (let i = 0; i <= n; i += 2) {
      const f = i / n;
      const x = x0 + (x1 - x0) * f;
      const y = terrainH(x, z) + 0.6 + rise * Math.sin(f * Math.PI);
      railPos.push(x, y + 0.95, z + s * half);
      railPos.push(x, y + 0.12, z + s * half);
    }
    const m = railPos.length / 4;
    for (let i = 0; i < m - 1; i++) { const a = i * 2, b = a + 2; railIdx.push(a, a + 1, b, b, a + 1, b + 1); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
    rg.setIndex(railIdx); rg.computeVertexNormals();
    grp.add(new THREE.Mesh(rg, lit('#dbe0ea', { map: T.stone('#c7cdd7'), rough: 0.88, side: THREE.DoubleSide })));
  }
  // 拱下的实腹：桥与水面之间用石砌填满
  const fill = [];
  for (let i = 0; i <= n; i += 4) {
    const f = i / n;
    const x = x0 + (x1 - x0) * f;
    const y = terrainH(x, z) + 0.6 + rise * Math.sin(f * Math.PI);
    fill.push(box((x1 - x0) / n * 4 + 0.4, y - (POOL.y - 1), width * 0.7, x, (y + POOL.y - 1) / 2, z));
  }
  grp.add(mesh(fill, lit('#8f959f', { map: T.stone('#7c828e'), rough: 0.94 })));
  for (const s of [-1, 1]) {
    const f = s < 0 ? 0.08 : 0.92;
    const bx = x0 + (x1 - x0) * f;
    const by = terrainH(bx, z) + 0.6 + rise * Math.sin(f * Math.PI) + 1.3;
    const lam = new THREE.Mesh(lanternGeo(0.28, 0.4), glow('#ffcf8a', 1.6));
    lam.position.set(bx, by, z + s * (half + 0.3));
    grp.add(lam);
    // 只有靠湖这一头的灯落在水面上，才给水里一道光柱
    if (s < 0) anchors.waterLamps.push(new THREE.Vector3(bx, POOL.y, z));
  }
  anchors.crowdPaths.push([new THREE.Vector3(x0, terrainH(x0, z) + 2, z), new THREE.Vector3((x0 + x1) / 2, terrainH((x0 + x1) / 2, z) + rise + 2, z), new THREE.Vector3(x1, terrainH(x1, z) + 2, z)]);
  parent.add(grp);
  return grp;
}

/* ==================================================== 夜游码头与长堤 */
function pier(parent, anchors) {
  const { len, width } = PIER;
  // 堤与栈桥的点位直接按世界坐标铺，所以这一组的原点留在 (0,0,0)
  const grp = group();
  // 堤：从山脚往南伸出去的一段石塘
  const cw = CAUSEWAY.map(([cx, cz]) => new THREE.Vector3(cx, Math.max(terrainH(cx, cz), 1.2) + 0.7, cz));
  const ccurve = new THREE.CatmullRomCurve3(cw, false, 'catmullrom', 0.4);
  const CS = 140;
  const csp = ccurve.getSpacedPoints(CS);
  const chw = 5.2;
  const cpos = [], cidx = [], cuv = [];
  for (let i = 0; i <= CS; i++) {
    const tan = ccurve.getTangent(i / CS).setY(0).normalize();
    const sx = -tan.z, sz = tan.x;
    cpos.push(csp[i].x - sx * chw, csp[i].y, csp[i].z - sz * chw);
    cpos.push(csp[i].x + sx * chw, csp[i].y, csp[i].z + sz * chw);
    cuv.push(0, i * 0.9, 1, i * 0.9);
    if (i < CS) { const a = i * 2; cidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
  cg.setIndex(cidx); cg.computeVertexNormals();
  const causeway = new THREE.Mesh(cg, lit('#c3c9d4', { map: T.paving(), rough: 0.9, side: THREE.DoubleSide }));
  causeway.receiveShadow = true;
  grp.add(causeway);
  // 堤侧的压顶桩
  const curb = new THREE.InstancedMesh(box(2.2, 1.2, 1.0, 0, 0, 0),
    lit('#9ba1ad', { map: T.stone('#8a909c'), rough: 0.92 }), Math.ceil(CS / 3));
  const d = new THREE.Object3D();
  let ki = 0;
  for (let i = 0; i < CS; i += 3) {
    const tan = ccurve.getTangent(i / CS).setY(0).normalize();
    for (const s of [-1, 1]) {
      if (ki >= curb.count) break;
      d.position.set(csp[i].x - tan.z * (chw + 0.5) * s, csp[i].y - 0.4, csp[i].z + tan.x * (chw + 0.5) * s);
      d.rotation.set(0, Math.atan2(tan.x, tan.z), 0); d.scale.setScalar(1); d.updateMatrix();
      curb.setMatrixAt(ki++, d.matrix);
    }
  }
  curb.count = ki;
  grp.add(curb);
  // 堤灯：夜里这条堤就是金山湖最亮的一条线
  const poleG = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.13, 4.6, 6).translate(0, 2.3, 0),
    new THREE.BoxGeometry(0.46, 0.14, 0.14).translate(0, 4.5, 0),
  ]);
  const lampAt = [];
  for (let i = 4; i < CS - 4; i += 7) lampAt.push(i);
  const poles = new THREE.InstancedMesh(poleG, lit('#4a4238', { rough: 0.78 }), lampAt.length * 2);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), glow('#ffd39a', 1.3), lampAt.length * 2);
  let pi = 0;
  for (const i of lampAt) {
    const tan = ccurve.getTangent(i / CS).setY(0).normalize();
    for (const s of [-1, 1]) {
      const px = csp[i].x - tan.z * (chw - 0.8) * s, pz = csp[i].z + tan.x * (chw - 0.8) * s;
      d.rotation.set(0, 0, 0); d.scale.setScalar(1);
      d.position.set(px, csp[i].y, pz); d.updateMatrix(); poles.setMatrixAt(pi, d.matrix);
      d.position.set(px, csp[i].y + 4.6, pz); d.updateMatrix(); bulbs.setMatrixAt(pi, d.matrix);
      anchors.waterLamps.push(new THREE.Vector3(px, 0.3, pz));
      pi++;
    }
  }
  poles.count = bulbs.count = pi;
  grp.add(poles, bulbs);
  // 栈桥：伸进湖里靠船
  const deck = new THREE.Group();
  const yaw = Math.atan2(csp[CS].z - csp[CS - 8].z, csp[CS].x - csp[CS - 8].x);
  deck.position.copy(csp[CS]);
  deck.rotation.y = yaw;
  deck.add(mesh(box(len, 0.5, width, 0, -0.25, width / 2 + 1),
    lit('#c6ccd6', { map: T.planks(), rough: 0.9 })));
  for (const s of [-1, 1]) {
    const rail = mesh(railingGeo(len, { height: 1.0, spacing: 1.5 }), M.marble);
    rail.position.set(0, 0.2, width + 1 + s * 0.1);
    rail.rotation.y = Math.PI / 2;
    rail.position.x = s * (len / 2 - 0.2);
    deck.add(rail);
  }
  for (let i = 0; i < 4; i++) {
    const lam = new THREE.Mesh(lanternGeo(0.34, 0.48), glow('#ffb063', 1.7));
    lam.position.set(-len / 2 + (len * (i + 0.5)) / 4, 3.2, width / 2 + 1);
    deck.add(lam);
    const post = mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), lit('#4a3a2c', { rough: 0.82 }));
    post.position.set(lam.position.x, 1.6, width / 2 + 1);
    deck.add(post);
    const wp = new THREE.Vector3(lam.position.x, 0.3, lam.position.z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(deck.position);
    anchors.waterLamps.push(wp);
  }
  // 站房与「金山湖」的牌子
  const hut = mesh([box(6, 3.4, 4, 0, 1.7, -3.6), box(7, 0.3, 5, 0, 3.5, -3.6)],
    lit('#b9bfc9', { map: T.stone('#a8aeb8'), rough: 0.9 }));
  deck.add(hut);
  const roof = new THREE.Mesh(chineseRoof({ width: 7, depth: 5, height: 1.5, ridgeRatio: 0.36, curve: 0.7, eaveLift: 0.7, overhang: 0.5, segU: 18, segV: 10 }), M.roofTemple);
  roof.position.set(0, 4.0, -3.6);
  roof.rotation.y = Math.PI / 2;
  deck.add(roof);
  const sign = plaqueMesh('金山湖', 3.4, 1.3, { bg: '#0f2438' });
  sign.position.set(0, 2.6, -1.5);
  deck.add(sign);
  grp.add(deck);
  anchors.crowdPaths.push([deck.position.clone().setY(deck.position.y + 0.6), csp[Math.floor(CS * 0.6)].clone().setY(csp[Math.floor(CS * 0.6)].y + 0.6)]);
  anchors.crowdPaths.push(ccurve.getSpacedPoints(48));
  anchors.berthWorld = csp[CS].clone();
  anchors.berthYaw = yaw;
  parent.add(grp);
  return { group: grp, curve: ccurve, deck: deck.position.clone(), yaw };
}

/* ==================================================== 装配 */
export function buildQuarter(scene) {
  const root = group();
  root.name = 'quarter';
  const anchors = {
    waterLamps: [], stringEnds: [], crowdPaths: [],
    towerTop: new THREE.Vector3(), berthWorld: new THREE.Vector3(), berthYaw: 0,
  };

  const tower = pagoda(root, anchors);
  const chime = windFrame(tower);

  hall(root, { ...AXIS.hall1, h: 7.4, name: '天王殿' });
  const main = hall(root, { ...AXIS.hall2, h: 9.6, name: '大雄宝殿' });
  hall(root, { ...AXIS.sutra, h: 9.2, stories: 2, name: '藏经楼' });
  hall(root, { x: AXIS.south.x, z: AXIS.south.z, w: 12, d: 8, h: 7.6, yaw: 0, name: '观音阁' });
  hall(root, { x: AXIS.west.x, z: AXIS.west.z, w: 11, d: 7.5, h: 7.0, yaw: 0, name: '夕照阁', colonnade: false });
  hall(root, { x: 24, z: -16, w: 11, d: 8, h: 7.4, yaw: 0, name: '楞伽台' });

  gateway(root);
  pavilion(root, { x: AXIS.pavilion.x, z: AXIS.pavilion.z, R: 4.4, h: 4.2, name: '江天一览亭' });
  terrace(root, { x: AXIS.terrace.x, z: AXIS.terrace.z, w: 13, d: 9, name: '妙高台' });
  stairway(root, anchors);
  gallery(root, anchors);
  cave(root, { ...CAVES.fahai, name: '法海洞' });
  cave(root, { ...CAVES.bailong, name: '白龙洞', w: 3.0, h: 3.4 });
  yudaiBridge(root, anchors);
  pier(root, anchors);

  LAYOUT.hall.door.copy(main.door);
  LAYOUT.hall.pos.set(AXIS.hall2.x, terrainH(AXIS.hall2.x, AXIS.hall2.z), AXIS.hall2.z);

  // 灯串的端点：殿前、阶侧、堤上，交给 props.js 拉成一条一条的暖线
  const pairs = [
    [[-58, 12], [-44, 10]], [[-44, 10], [-33, 8]], [[-33, 8], [-22, 6]],
    [[-20, 14], [-8, 12]], [[-8, 12], [6, 8]], [[6, 8], [16, 4]],
    [[-28, -22], [-20, -28]], [[-18, -30], [-10, -34]],
    [[-20, 50], [-6, 56]], [[-6, 56], [10, 60]], [[10, 60], [26, 66]], [[26, 66], [44, 70]],
  ];
  for (const [[ax, az], [bx, bz]] of pairs) {
    anchors.stringEnds.push([
      new THREE.Vector3(ax, terrainH(ax, az) + 4.4, az),
      new THREE.Vector3(bx, terrainH(bx, bz) + 4.2, bz),
    ]);
  }
  // 檐下灯串：三进的正面各拉两道
  for (const s of [AXIS.hall1, AXIS.hall2, AXIS.sutra]) {
    const g = terrainH(s.x, s.z);
    for (const off of [-2.6, 2.6]) {
      anchors.stringEnds.push([
        new THREE.Vector3(s.x - s.d / 2 - 0.6, g + 8.2, s.z + off),
        new THREE.Vector3(s.x + s.d / 2 + 0.6, g + 8.0, s.z + off * 1.2),
      ]);
    }
  }
  // 崖洞到塔之间的两条
  anchors.stringEnds.push([
    new THREE.Vector3(CAVES.fahai.x, terrainH(CAVES.fahai.x, CAVES.fahai.z) + 5.2, CAVES.fahai.z),
    new THREE.Vector3(TOWER.x - 4, terrainH(TOWER.x - 4, TOWER.z + 4) + 5.0, TOWER.z + 4),
  ]);
  anchors.stringEnds.push([
    new THREE.Vector3(YUDAI.x0 + 2, POOL.y + 5.2, YUDAI.z),
    new THREE.Vector3(YUDAI.x1 - 2, POOL.y + 5.0, YUDAI.z - 3),
  ]);

  scene.add(root);
  return { group: root, anchors, tower, chime, setEave, hall: main };
}
