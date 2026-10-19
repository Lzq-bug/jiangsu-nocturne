import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, glow, box, chineseRoof, pillarGeo, railingGeo, plaqueMesh, M } from './kit.js';
import * as T from './textures.js';
import { ALLEY, YARD, GARDEN, GROUND, groundAt, streamCenter, streamHalf, waterSD } from './data.js';

export function initMXMaterials() {
  // 粉墙：夜里被灯笼照到的那一面要暖，照不到的那一面得冷
  M.mxPlaster = lit('#d3d6cd', { map: T.plaster('#c3c8c0'), rough: 0.96 });
  M.mxPlasterDark = lit('#9aa1a4', { map: T.plaster('#8d9498'), rough: 0.97, emissive: '#0a1218', ei: 0.35 });
  M.mxTile = lit('#c6cdd9', { map: T.roofTiles('#2f3a4a', '#465368', '#6c7b93'), rough: 0.8, side: THREE.DoubleSide, emissive: '#101722', ei: 0.5 });
  M.mxBrick = lit('#b4b8bd', { map: T.stone('#7c8288'), rough: 0.9 });
  M.mxBrickDark = lit('#7d838a', { map: T.stone('#5c6268'), rough: 0.92 });
  M.pave = lit('#8d9298', { map: T.stone('#565d66'), rough: 0.93 });
  M.pave.map.repeat.set(34, 16);
  M.ashl = lit('#767c83', { map: T.stone('#4f555d'), rough: 0.94 });
  M.rock = lit('#6b717a', { map: T.stone('#525860'), rough: 0.88, side: THREE.DoubleSide });
  M.timber = lit('#8a5a3c', { map: T.wood('#6d402a', '#3d2015'), rough: 0.72 });
  M.timberDark = lit('#5d3a28', { map: T.wood('#4a2a1d', '#28150f'), rough: 0.78 });
  M.redTimber = lit('#a8493a', { map: T.wood('#8a3128', '#4f1a14'), rough: 0.6 });
  // 长窗里的灯光：整张窗纸就是一块发光面
  M.winGlow = new THREE.MeshBasicMaterial({ map: T.lattice(5, 4, '#3d2016', '#ffd39a'), toneMapped: false, side: THREE.DoubleSide });
  M.winCool = new THREE.MeshBasicMaterial({ map: T.lattice(4, 6, '#2a2f38', '#9fc4d8'), toneMapped: false, side: THREE.DoubleSide });
  return M;
}

/* ------------------------------------------------------------------ 通用墙体 */

/**
 * 一面墙：沿本地 X 铺开、向上 Y、挤出厚度 Z，洞（门/窗/月洞/漏窗）在本地 XY 上挖。
 * 用 ExtrudeGeometry 而不是拼盒子，圆洞的边才真的是圆的。
 */
function wallGeo({ length, height, thick = 0.42, holes = [] }) {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, 0);
  s.lineTo(length / 2, 0);
  s.lineTo(length / 2, height);
  s.lineTo(-length / 2, height);
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    if (h.type === 'circle') {
      p.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true);
    } else if (h.type === 'diamond') {
      p.moveTo(h.x, h.y - h.r);
      p.lineTo(h.x + h.r * 0.8, h.y);
      p.lineTo(h.x, h.y + h.r);
      p.lineTo(h.x - h.r * 0.8, h.y);
      p.closePath();
    } else {
      p.moveTo(h.x - h.w / 2, h.y - h.h / 2);
      p.lineTo(h.x + h.w / 2, h.y - h.h / 2);
      p.lineTo(h.x + h.w / 2, h.y + h.h / 2);
      p.lineTo(h.x - h.w / 2, h.y + h.h / 2);
      p.closePath();
    }
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 22, steps: 1 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** 墙帽：一层薄瓦脊压顶，两端微微起身 */
function copingGeo(length, { ridgeY = 0.3, overhang = 0.18 } = {}) {
  const parts = [];
  const cap = new THREE.BoxGeometry(length + overhang * 2, 0.2, 0.78);
  cap.translate(0, ridgeY - 0.06, 0);
  parts.push(cap);
  const spine = new THREE.BoxGeometry(length + overhang * 2, 0.16, 0.3);
  spine.translate(0, ridgeY + 0.08, 0);
  parts.push(spine);
  for (const s of [-1, 1]) {
    const kick = new THREE.BoxGeometry(0.42, 0.5, 0.34);
    kick.translate(s * (length / 2 + overhang * 0.4), ridgeY + 0.18, 0);
    parts.push(kick);
  }
  return mergeGeometries(parts);
}

/** 硬山：山墙随屋面收顶，两坡直落到檐口，不出山 */
function gableWallGeo({ width, height, ridgeH, thick = 0.4, curve = 0.6 }) {
  const hw = width / 2;
  const pts = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 脊 → 1 檐
    const s = t * (1 - curve) + Math.sqrt(t) * curve;
    const x = t * hw;
    pts.push([x, ridgeH - (ridgeH - height) * s]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(-hw - 0.02, 0);
  shape.lineTo(-hw - 0.02, height);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.lineTo(hw + 0.02, height);
  shape.lineTo(hw + 0.02, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/**
 * 两坡硬山屋面：正脊沿本地 X（与前檐墙平行），两坡向 ±Z 落下。
 * 断面与山墙用同一条反曲线，瓦面才压得住山尖。
 */
function gableRoofGeo({ width, depth, height, ridgeH, overhang = 0.55, curve = 0.6 }) {
  const hl = width / 2 + overhang * 0.6; // 正脊方向半长
  const hd = depth / 2 + overhang;        // 坡面走向半跨
  const drop = ridgeH - height;
  const NU = 16, NV = 12;
  const pos = [], uv = [], idx = [];
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= NU; j++) {
      const x = -hl + (2 * hl * j) / NU;
      for (let i = 0; i <= NV; i++) {
        const t = i / NV;
        const st = t * (1 - curve) + Math.sqrt(t) * curve;
        // 檐口在山墙两端微微起身，硬山的翘只敢翘这么一点
        const lift = 0.05 * drop * Math.pow(t, 3) * Math.pow(Math.abs(x) / hl, 2);
        pos.push(x, ridgeH - drop * st + lift, s * t * hd);
        uv.push(x / 5.4, t * 1.6);
      }
    }
    const row = NV + 1;
    for (let j = 0; j < NU; j++) {
      for (let i = 0; i < NV; i++) {
        const a = base + j * row + i, b = a + row, c = a + 1, d = c + row;
        idx.push(a, b, c, c, b, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ridge = new THREE.BoxGeometry(width + overhang * 1.2, 0.3, 0.5).translate(0, ridgeH + 0.13, 0);
  return mergeGeometries([g.toNonIndexed(), ridge.toNonIndexed()]);
}

/** 一座硬山房：台明 + 前后檐墙 + 两山墙 + 屋面 + 明间开门、次间开窗 */
function building({
  x, z, width, depth, height, ridgeH, rotY = 0,
  bays = 3, door = true, windows = 2, plaque = null, columns = true, glowWindows = true, openFront = false,
}) {
  const grp = new THREE.Group();
  const baseH = 0.36;

  // 台明与踏道
  grp.add(new THREE.Mesh(box(width + 1.1, baseH, depth + 1.1, 0, baseH / 2, 0), M.mxBrick));
  for (let i = 0; i < 3; i++) {
    grp.add(new THREE.Mesh(box(width * 0.42, 0.16, 0.4, 0, baseH - 0.08 - i * 0.15, depth / 2 + 0.62 + i * 0.36), M.ashl));
  }

  const t = 0.4;
  const wallH = height - baseH;
  const dw = bays === 3 ? width * 0.2 : width * 0.3;
  const doorH = wallH * 0.74;
  const frontHoles = [];
  if (door) frontHoles.push({ type: 'rect', x: 0, y: doorH / 2, w: dw, h: doorH - 0.12 });
  for (let i = 0; i < windows; i++) {
    frontHoles.push({ type: 'rect', x: (i === 0 ? -1 : 1) * width * 0.3, y: wallH * 0.5, w: width * 0.17, h: wallH * 0.4 });
  }
  const backHoles = [
    { type: 'rect', x: -width * 0.28, y: wallH * 0.55, w: width * 0.16, h: wallH * 0.34 },
    { type: 'rect', x: width * 0.28, y: wallH * 0.55, w: width * 0.16, h: wallH * 0.34 },
  ];
  const nf = new THREE.Mesh(wallGeo({ length: width, height: wallH, thick: t, holes: frontHoles }), M.mxPlaster);
  nf.position.set(0, baseH, depth / 2);
  nf.castShadow = nf.receiveShadow = true;
  const nb = new THREE.Mesh(wallGeo({ length: width, height: wallH, thick: t, holes: backHoles }), M.mxPlasterDark);
  nb.position.set(0, baseH, -depth / 2);
  nb.receiveShadow = true;
  grp.add(nf, nb);

  // 山墙（沿 depth 方向收顶随屋面）
  for (const s of [-1, 1]) {
    const gw = new THREE.Mesh(gableWallGeo({ width: depth, height: wallH, ridgeH: ridgeH - baseH, thick: t }), M.mxPlaster);
    gw.rotation.y = Math.PI / 2;
    gw.position.set(s * (width / 2), baseH, 0);
    gw.castShadow = gw.receiveShadow = true;
    grp.add(gw);
  }

  // 屋面：局部高度即全房高度，不再叠加台明
  const roof = new THREE.Mesh(gableRoofGeo({ width, depth, height, ridgeH }), M.mxTile);
  roof.castShadow = roof.receiveShadow = true;
  grp.add(roof);

  // 檐柱与挑檐枋
  if (columns) {
    const ph = wallH * 0.96;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo(ph, 0.16), M.redTimber);
      p.position.set(sx * (width / 2 - 0.5), baseH, sz * (depth / 2 + 0.28));
      p.castShadow = true;
      grp.add(p);
    }
    for (const sz of [-1, 1]) {
      grp.add(new THREE.Mesh(box(width - 0.5, 0.24, 0.2, 0, baseH + ph + 0.12, sz * (depth / 2 + 0.28)), M.timberDark));
    }
  }

  // 门扇、窗扇（openFront：门开着、窗敞着，屋里才看得见外面的水）
  if (door && !openFront) {
    for (const s of [-1, 1]) {
      grp.add(new THREE.Mesh(box(dw / 2 - 0.04, doorH - 0.2, 0.09, s * dw / 4, baseH + (doorH - 0.2) / 2, depth / 2 + 0.08), M.timberDark));
    }
  }
  if (door) {
    grp.add(new THREE.Mesh(box(dw + 0.5, 0.22, 0.32, 0, baseH + doorH + 0.06, depth / 2 + 0.12), M.timber));
  }
  for (let i = 0; i < windows; i++) {
    const off = (i === 0 ? -1 : 1) * width * 0.3;
    if (!openFront) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.155, wallH * 0.38), glowWindows ? M.winGlow : M.winCool);
      pane.position.set(off, baseH + wallH * 0.5, depth / 2 + 0.22);
      grp.add(pane);
      grp.add(new THREE.Mesh(box(width * 0.19, wallH * 0.43, 0.08, off, baseH + wallH * 0.5, depth / 2 + 0.14), M.timber));
    } else {
      // 敞开的长窗：只留两扇支起来的窗扇，中间空出来给月色
      for (const s of [-1, 1]) {
        const leaf = new THREE.Mesh(box(width * 0.08, wallH * 0.38, 0.06, off + s * width * 0.1, baseH + wallH * 0.5, depth / 2 + 0.3), M.timberDark);
        leaf.rotation.y = s * 0.9;
        grp.add(leaf);
      }
    }
  }

  if (plaque) {
    const p = plaqueMesh(plaque.text, plaque.w, plaque.h, { dir: 'h', bg: '#152437', fg: '#f0dcb6' });
    p.position.set(0, baseH + doorH + 0.42, depth / 2 + 0.34);
    grp.add(p);
  }

  grp.position.set(x, GROUND, z);
  grp.rotation.y = rotY;
  return grp;
}

/* ------------------------------------------------------------------ 巷 */
function alleySection(anchors) {
  const grp = new THREE.Group();
  const L = ALLEY.xTo - ALLEY.xFrom;
  const cx = (ALLEY.xFrom + ALLEY.xTo) / 2;
  const h = ALLEY.wallH;
  const t = 0.44;

  for (const s of [-1, 1]) {
    const holes = [];
    // 巷子两侧零散几户门与漏窗
    const doors = s < 0 ? [-52, -36.5, -24.5] : [-46, -31, -21];
    for (const dx of doors) {
      holes.push({ type: 'rect', x: dx - cx, y: h * 0.33, w: 1.25, h: h * 0.64 });
    }
    holes.push({ type: 'diamond', x: -42.5 - cx, y: h * 0.66, r: 0.52 });
    holes.push({ type: 'rect', x: -28 - cx, y: h * 0.7, w: 1.0, h: 0.72 });
    const w = new THREE.Mesh(wallGeo({ length: L, height: h, thick: t, holes }), s < 0 ? M.mxPlaster : M.mxPlasterDark);
    w.position.set(cx, GROUND, s * (ALLEY.halfZ + t / 2));
    w.castShadow = true;
    w.receiveShadow = true;
    grp.add(w);
    const cap = new THREE.Mesh(copingGeo(L), M.mxTile);
    cap.position.set(cx, GROUND + h, s * (ALLEY.halfZ + t / 2));
    grp.add(cap);

    // 门洞上方的砖细与门簪
    for (const dx of (s < 0 ? [-52, -36.5, -24.5] : [-46, -31, -21])) {
      const head = new THREE.Mesh(box(1.7, 0.34, 0.58, dx, GROUND + h * 0.33 + h * 0.32 + 0.16, s * (ALLEY.halfZ + t / 2)), M.mxBrick);
      grp.add(head);
      anchors.lamps.push({ pos: [dx + 0.9, GROUND + h * 0.33 + h * 0.36, s * (ALLEY.halfZ - 0.35)], kind: 'door' });
    }
  }

  // 青石板路：中间一条走街，两侧散水。抬高一点才盖住下面的地形网格
  const pave = new THREE.Mesh(box(L + 1.2, 0.16, ALLEY.halfZ * 2 + 0.9, cx, GROUND + 0.02, 0), M.pave);
  pave.receiveShadow = true;
  grp.add(pave);
  // 板石缝（横向一条条），石板才不像一整块地坪
  for (let x = ALLEY.xFrom + 1; x < ALLEY.xTo; x += 1.15) {
    grp.add(new THREE.Mesh(box(0.07, 0.03, ALLEY.halfZ * 2 + 0.6, x, GROUND + 0.11, 0), M.mxBrickDark));
  }
  for (const s of [-1, 1]) {
    grp.add(new THREE.Mesh(box(L + 1, 0.2, 0.34, cx, GROUND + 0.06, s * (ALLEY.halfZ - 0.2)), M.ashl));
  }

  // 巷口门楼：一对砖砌墩子 + 石额
  const gate = new THREE.Group();
  for (const s of [-1, 1]) {
    const pier = new THREE.Mesh(box(1.05, 4.9, 1.5, 0, 2.45, s * 3.85), M.mxBrick);
    pier.castShadow = true;
    gate.add(pier);
    const cap = new THREE.Mesh(copingGeo(1.6, { ridgeY: 0.35 }), M.mxTile);
    cap.position.set(0, 4.9, s * 3.85);
    cap.scale.set(0.9, 1, 1.0);
    gate.add(cap);
  }
  const lintel = new THREE.Mesh(box(1.35, 0.95, 9.2, 0, 4.55, 0), M.mxBrick);
  gate.add(lintel);
  const roof = new THREE.Mesh(chineseRoof({ width: 2.4, depth: 9.6, height: 0.85, ridgeRatio: 0.62, overhang: 0.3, hip: false }), M.mxTile);
  roof.position.set(0, 5.0, 0);
  roof.rotation.y = Math.PI / 2;
  gate.add(roof);
  const name = plaqueMesh('梦溪园巷', 2.1, 0.78, { dir: 'h', bg: '#28323e', fg: '#e6dfc8', note: '' });
  name.rotation.y = -Math.PI / 2;
  name.position.set(-0.72, 4.5, 0);
  gate.add(name);
  const nameBack = plaqueMesh('梦溪园巷', 2.1, 0.78, { dir: 'h', bg: '#28323e', fg: '#e6dfc8' });
  nameBack.rotation.y = Math.PI / 2;
  nameBack.position.set(0.72, 4.5, 0);
  gate.add(nameBack);
  // 巷名牌石（今人所立，写意补配）：立在巷口内侧，进巷第一眼就读得到
  const marker = new THREE.Group();
  marker.add(new THREE.Mesh(box(0.62, 1.85, 0.34, 0, 0.93, 0), M.ashl));
  const markerText = plaqueMesh('梦溪园巷', 0.4, 1.42, { dir: 'v', bg: '#39434d', fg: '#eae4cf' });
  markerText.position.set(0, 1.02, 0.18);
  marker.add(markerText);
  marker.position.set(-54.6, GROUND, -2.45);
  marker.rotation.y = -Math.PI / 2 - 0.2;
  grp.add(marker);
  anchors.marker = [-57.6, GROUND + 1.9, 2.35];
  gate.position.set(ALLEY.xFrom, GROUND, 0);
  grp.add(gate);
  anchors.lamps.push({ pos: [ALLEY.xFrom + 1.4, GROUND + 3.6, 2.5], kind: 'gate', big: true });
  anchors.lamps.push({ pos: [ALLEY.xFrom + 1.4, GROUND + 3.6, -2.5], kind: 'gate', big: true });

  // 巷灯位置：吊在山墙尽头与门簪之下
  for (const dx of [-58, -50, -41, -33, -25, -19.6]) {
    anchors.lamps.push({ pos: [dx, GROUND + 3.15, (dx % 2 === 0 ? 1 : -1) * (ALLEY.halfZ - 0.45)], kind: 'alley' });
  }
  return grp;
}

/* ------------------------------------------------------------------ 前院与门厅 */
function yardSection(anchors) {
  const grp = new THREE.Group();

  // 门厅：清代硬山平房，面阔三间，门朝西向巷
  const hall = building({
    x: YARD.hall.cx, z: YARD.hall.cz,
    width: YARD.hall.widthZ, depth: YARD.hall.depthX,
    height: YARD.hall.eave, ridgeH: YARD.hall.ridge,
    rotY: -Math.PI / 2, bays: 3, door: true, windows: 2,
    plaque: { text: '沈括故居', w: 2.2, h: 0.72 },
  });
  hall.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  grp.add(hall);

  // 院墙：南北两条沿 X 铺开，东端交给界墙
  {
    const len = GARDEN.xFrom - YARD.xFrom;
    const cx = (YARD.xFrom + GARDEN.xFrom) / 2;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wallGeo({ length: len, height: 3.9, thick: 0.42,
        holes: [{ type: 'rect', x: -3.2, y: 1.95, w: 1.05, h: 1.1 }] }), s > 0 ? M.mxPlaster : M.mxPlasterDark);
      w.position.set(cx, GROUND, s * YARD.zTo);
      w.castShadow = w.receiveShadow = true;
      grp.add(w);
      const cap = new THREE.Mesh(copingGeo(len), M.mxTile);
      cap.position.set(cx, GROUND + 3.9, s * YARD.zTo);
      grp.add(cap);
    }
  }

  // 院中石板与一块残碑
  const pad = new THREE.Mesh(box(YARD.xTo - YARD.xFrom + 1.5, 0.16, YARD.zTo - YARD.zFrom + 1.2,
    (YARD.xFrom + YARD.xTo) / 2, GROUND + 0.02, 0), M.pave);
  pad.receiveShadow = true;
  grp.add(pad);
  const stele = new THREE.Group();
  stele.add(new THREE.Mesh(box(1.5, 0.42, 0.9, 0, 0.21, 0), M.ashl));
  const body = new THREE.Mesh(box(0.66, 2.05, 0.24, 0, 1.44, 0), M.mxBrickDark);
  body.castShadow = true;
  stele.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.7), glow('#c9d4da', 0.3));
  face.position.set(0, 1.42, 0.13);
  stele.add(face);
  stele.position.set(-6.4, GROUND, 4.6);
  stele.rotation.y = -0.22;
  grp.add(stele);
  anchors.lamps.push({ pos: [-9.4, GROUND + 3.1, 2.4], kind: 'yard' });
  anchors.lamps.push({ pos: [-9.4, GROUND + 3.1, -2.4], kind: 'yard' });
  anchors.stele = [-6.4, GROUND + 2.5, 4.6];
  return grp;
}

/* ------------------------------------------------------------------ 界墙与园门 */
function boundaryWall(anchors) {
  const grp = new THREE.Group();
  const len = GARDEN.zTo - GARDEN.zFrom + 1.4;
  const h = GARDEN.wallH;
  const holes = [
    { type: 'circle', x: 0, y: 1.62, r: 1.35 },
    { type: 'rect', x: -7.5, y: 1.95, w: 1.05, h: 1.15 },
    { type: 'rect', x: 7.5, y: 1.95, w: 1.05, h: 1.15 },
    { type: 'diamond', x: -12.6, y: 2.0, r: 0.5 },
    { type: 'diamond', x: 12.6, y: 2.0, r: 0.5 },
  ];
  const w = new THREE.Mesh(wallGeo({ length: len, height: h, thick: 0.5, holes }), M.mxPlaster);
  w.rotation.y = Math.PI / 2;
  w.position.set(GARDEN.xFrom, GROUND, 0);
  w.castShadow = w.receiveShadow = true;
  grp.add(w);
  const cap = new THREE.Mesh(copingGeo(len), M.mxTile);
  cap.rotation.y = Math.PI / 2;
  cap.position.set(GARDEN.xFrom, GROUND + h, 0);
  grp.add(cap);

  // 月洞门的砖细圈（两道）
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.11, 8, 40), M.mxBrick);
    ring.position.set(GARDEN.xFrom + s * 0.28, GROUND + 1.62, 0);
    ring.rotation.y = Math.PI / 2;
    grp.add(ring);
  }
  const namePlate = plaqueMesh('梦溪', 0.86, 0.5, { dir: 'h', bg: '#2c3540', fg: '#e9e2cc' });
  namePlate.position.set(GARDEN.xFrom - 0.34, GROUND + GARDEN.wallH + 0.3, 0);
  namePlate.rotation.y = -Math.PI / 2;
  grp.add(namePlate);
  anchors.lamps.push({ pos: [GARDEN.xFrom - 1.1, GROUND + 3.1, 0], kind: 'gate', big: true });
  anchors.gardenGate = [GARDEN.xFrom, GROUND + 1.6, 0];

  // 洞门两侧的漏窗里透出竹影
  for (const x of [-7.5, 7.5]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), M.winCool);
    pane.position.set(GARDEN.xFrom, GROUND + 1.95, x);
    pane.rotation.y = Math.PI / 2;
    grp.add(pane);
  }
  return grp;
}

/* ------------------------------------------------------------------ 园墙（龙形矮墙） */
function gardenWall() {
  const grp = new THREE.Group();
  const segs = [
    { from: [GARDEN.xFrom, GARDEN.zFrom], to: [GARDEN.xTo, GARDEN.zFrom] },
    { from: [GARDEN.xTo, GARDEN.zFrom], to: [GARDEN.xTo, GARDEN.zTo] },
    { from: [GARDEN.xTo, GARDEN.zTo], to: [GARDEN.xFrom, GARDEN.zTo] },
  ];
  const h = GARDEN.wallH;
  for (const { from, to } of segs) {
    const dx = to[0] - from[0], dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const w = new THREE.Mesh(wallGeo({ length: len, height: h, thick: 0.4 }), M.mxPlaster);
    w.position.set(from[0] + dx / 2, GROUND, from[1] + dz / 2);
    w.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    w.receiveShadow = true;
    grp.add(w);
    // 龙墙：脊随波浪起伏，一节一节像伏着的龙
    const N = Math.max(6, Math.round(len / 1.05));
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = GROUND + h + 0.06 + Math.sin(t * Math.PI * (len / 9)) * 0.16;
      const lump = new THREE.Mesh(box(1.12, 0.2, 0.56, 0, 0, 0), M.mxTile);
      lump.position.set(from[0] + dx * t, y, from[1] + dz * t);
      lump.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      grp.add(lump);
    }
  }
  return grp;
}

/* ------------------------------------------------------------------ 书斋 */
function studyBuilding(anchors) {
  const g = GARDEN.study;
  const width = g.zTo - g.zFrom, depth = g.xTo - g.xFrom;
  const b = building({
    x: (g.xFrom + g.xTo) / 2, z: (g.zFrom + g.zTo) / 2,
    width, depth, height: g.eave, ridgeH: g.ridge,
    rotY: Math.PI / 2, bays: 3, door: true, windows: 1,
    plaque: { text: '著书处', w: 1.5, h: 0.52 },
    openFront: true,
  });
  b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  anchors.studyFront = [(g.xFrom + g.xTo) / 2 + depth / 2, GROUND, (g.zFrom + g.zTo) / 2];
  return b;
}

/* ------------------------------------------------------------------ 溪亭 */
function pavilion(anchors) {
  const { x, z, r, h } = GARDEN.pavilion;
  const grp = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.85, r + 1.1, 0.42, 8), M.mxBrick);
  plinth.position.y = 0.21;
  plinth.receiveShadow = true;
  grp.add(plinth);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const p = new THREE.Mesh(pillarGeo(h - 0.5, 0.13), M.redTimber);
    p.position.set(Math.cos(a) * r, 0.42, Math.sin(a) * r);
    p.castShadow = true;
    grp.add(p);
  }
  const roof = new THREE.Mesh(chineseRoof({ width: r * 2.6, depth: r * 2.6, height: 1.5, ridgeRatio: 0.18, curve: 0.66, eaveLift: 0.8, overhang: 0.4 }), M.mxTile);
  roof.position.y = h;
  roof.castShadow = true;
  grp.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow('#ffd9a0', 1.1));
  finial.position.y = h + 1.62;
  grp.add(finial);
  const rail = [];
  for (let i = 0; i < 6; i++) {
    if (i === 0) continue; // 入口一面空着
    const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6, a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
    const p0 = [Math.cos(a0) * r, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const g = railingGeo(len, { height: 0.82, spacing: 0.8 });
    const m = new THREE.Mesh(g, M.timber);
    m.position.set((p0[0] + p1[0]) / 2, 0.42, (p0[1] + p1[1]) / 2);
    m.rotation.y = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
    grp.add(m);
  }
  void rail;
  const plaque = plaqueMesh('听溪', 0.9, 0.46, { dir: 'h', bg: '#1d2a24', fg: '#ecdfbe' });
  plaque.position.set(0, h - 0.28, r * 0.4);
  plaque.rotation.y = Math.PI;
  grp.add(plaque);
  grp.position.set(x, GROUND, z);
  anchors.lamps.push({ pos: [x, GROUND + h - 0.4, z], kind: 'pavilion', big: true });
  anchors.pavilion = [x, GROUND, z];
  return grp;
}

/* ------------------------------------------------------------------ 溪上石梁桥 */
function stoneBridge() {
  const grp = new THREE.Group();
  const z = GARDEN.bridge.z;
  const c = streamCenter(z), hw = streamHalf(z) + 1.5;
  const deckY = GROUND + 1.12;
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(box(hw * 2 + 1.2, 0.26, 0.62, 0, deckY, s * 0.42), M.ashl);
    slab.position.x = c;
    slab.position.z = z + s * 0.44;
    slab.castShadow = true;
    grp.add(slab);
  }
  // 栏板望柱
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 6; i++) {
      const x = c - hw - 0.5 + ((hw * 2 + 1) * i) / 6;
      const post = new THREE.Mesh(box(0.16, 0.62, 0.16, x, deckY + 0.42, z + s * 0.86), M.mxBrick);
      grp.add(post);
    }
    const rail = new THREE.Mesh(box(hw * 2 + 1.1, 0.14, 0.2, c, deckY + 0.72, z + s * 0.86), M.mxBrick);
    grp.add(rail);
  }
  // 两端石阶
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(box(1.5, 0.2, 0.36, c + s * (hw + 1.4 + i * 0.36), deckY - 0.3 - i * 0.34, z), M.ashl);
      grp.add(step);
    }
  }
  // 桥下垫石
  for (const dx of [-hw * 0.5, 0, hw * 0.5]) {
    const pier = new THREE.Mesh(box(0.7, 2.1, 1.9, c + dx, deckY - 1.2, z), M.mxBrickDark);
    grp.add(pier);
  }
  return grp;
}

/* ------------------------------------------------------------------ 假山 */
function rockery(cx, cz, scale = 1) {
  const grp = new THREE.Group();
  const parts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.7;
    const rad = (0.6 + (i % 3) * 0.55) * scale;
    const g = new THREE.IcosahedronGeometry(rad, 1);
    g.scale(1.15, 0.75 + (i % 4) * 0.32, 0.95);
    g.rotateY(a);
    g.translate(Math.cos(a) * rad * 1.15 * scale, rad * (0.5 + (i % 3) * 0.42) * scale, Math.sin(a) * rad * 1.05 * scale);
    parts.push(g.toNonIndexed());
  }
  const rock = new THREE.Mesh(mergeGeometries(parts), M.rock);
  rock.castShadow = rock.receiveShadow = true;
  grp.add(rock);
  grp.position.set(cx, GROUND - 0.2, cz);
  return grp;
}

/* ------------------------------------------------------------------ 候气砖台（星台） */
function starPlatform(anchors) {
  const { x, z, r } = GARDEN.starPlatform;
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.35, 0.55, 10), M.mxBrick);
  base.position.y = 0.28;
  base.receiveShadow = true;
  grp.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.25, r - 0.1, 0.16, 10), M.ashl);
  top.position.y = 0.62;
  grp.add(top);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    grp.add(new THREE.Mesh(box(0.34, 0.2, 0.34, Math.cos(a) * (r + 0.1), 0.62, Math.sin(a) * (r + 0.1)), M.mxBrickDark));
  }
  grp.position.set(x, GROUND, z);
  anchors.starPlatform = [x, GROUND + 0.7, z];
  return grp;
}

/* ------------------------------------------------------------------ 地面高度场 */
function groundField() {
  const x0 = -72, x1 = 50, z0 = -28, z1 = 28;
  const NX = 210, NZ = 130;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, NX, NZ);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const col = [];
  const cLand = new THREE.Color('#2b3138'), cBank = new THREE.Color('#1a1f24'), cMud = new THREE.Color('#080c0f');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = groundAt(x, z);
    p.setY(i, y);
    const sd = waterSD(x, z);
    const c = y < -0.4 ? cMud : (sd < 1.0 ? cBank : cLand);
    const k = 0.72 + 0.28 * Math.abs(Math.sin(x * 0.7) * Math.sin(z * 0.63));
    col.push(c.r * k, c.g * k, c.b * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, map: T.stone('#4a5058') });
  mat.map = mat.map.clone();
  mat.map.repeat.set(34, 16);
  mat.map.needsUpdate = true;
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  return mesh;
}

/** 园内石板步道：从园门绕池东去，再上星台 */
function gardenPaths() {
  const grp = new THREE.Group();
  const curve = [
    [2.4, 0], [6.5, -1.6], [12, -3.4], [17, -4.6], [21.5, -3.2], [24.5, 0.5],
    [23.6, 5.5], [20.2, 8.6], [17.6, 11.2], [15.4, 15.0], [14.6, 19.4],
  ];
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, z0] = curve[i], [x1, z1] = curve[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const slab = new THREE.Mesh(box(0.95, 0.1, 0.72, 0, 0, 0), M.pave);
      slab.position.set(x, groundAt(x, z) + 0.04, z);
      slab.rotation.y = Math.atan2(x1 - x0, z1 - z0) + (k % 2 ? 0.06 : -0.05);
      slab.receiveShadow = true;
      grp.add(slab);
    }
  }
  return grp;
}

export function buildQuarter(scene) {
  const anchors = { lamps: [], paths: [] };
  const group = new THREE.Group();
  group.name = 'mengxiyuan';
  // 地形与步道不进倒影：把它们混进建筑组里，水面下就会多出一整块翻过来的地面
  const terrain = new THREE.Group();
  terrain.name = 'terrain';

  terrain.add(groundField());
  terrain.add(gardenPaths());
  group.add(alleySection(anchors));
  group.add(yardSection(anchors));
  group.add(boundaryWall(anchors));
  group.add(gardenWall());
  group.add(studyBuilding(anchors));
  group.add(pavilion(anchors));
  group.add(stoneBridge());
  group.add(starPlatform(anchors));
  group.add(rockery(37.5, 14, 1.5));
  group.add(rockery(31, 17.4, 1.05));
  group.add(rockery(20.5, -16.4, 1.15));
  group.add(rockery(36.5, -6, 0.85));

  scene.add(terrain, group);
  return { group, terrain, anchors };
}
