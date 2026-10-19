import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, groundAt } from './data.js';
import { M, lit, glow, mesh, box, cyl, loft, inscribed, roundedSection } from './kit.js';
import { gabledRoof, pavilionRoof } from './roofs.js';
import * as T from './textures.js';

/**
 * 山前到脊上的五处人工物：景区门楼、九龙桥、三元宫、南天门、海清寺塔。
 * 形制按通例补，尺寸按可考的来：桥单孔、长 33.4 米宽 8 米、孔宽 6.6 米；
 * 塔九级八面、通高 40.58 米、塔门朝南、每层四面券门四面直棂假窗。
 *
 * 每件建筑都在自己的局部坐标里造好（前面朝 -Z、面阔沿 X），再按朝向一次性
 * 落位——山坡上的轴线是东西向的，不这么做就会把殿门朝错一面。
 */

const BRICK = lit('#6f6c64', {
  map: T.brick({ meters: 2.6 }), rough: 0.93, metal: 0.02, side: THREE.DoubleSide,
  emissive: '#141416', ei: 0.22,
});
const BRICK_DARK = lit('#4c4a45', { map: T.brick({ meters: 3.6 }), rough: 0.96, side: THREE.DoubleSide });

export function buildArchitecture(scene) {
  const grp = new THREE.Group();
  grp.name = 'architecture';
  const P = {
    brick: [], brickDark: [], stone: [], plaster: [], timber: [],
    roof: [], dark: [], doorGlow: [], winGlow: [], gold: [],
  };
  const anchors = [];        // [x, y, z, kind]，props 按 kind 布灯
  const carvings = [];       // 题刻面片，开关打亮
  const towerTiers = [];     // 每层的券门，供"九级次第"点亮

  const gate = buildGate(P, anchors, carvings, grp);
  const bridge = buildBridge(P, anchors);
  const temple = buildTemple(P, anchors, carvings, grp);
  const southgate = buildSouthGate(P, anchors, carvings, grp);
  const tower = buildTower(grp, P, anchors, towerTiers);

  for (const [key, parts] of Object.entries(P)) {
    if (!parts.length) continue;
    const mat = {
      brick: BRICK, brickDark: BRICK_DARK, stone: M.stone, plaster: M.plaster,
      timber: M.timber, roof: M.roof, dark: M.dark, gold: M.gold,
      doorGlow: glow('#ffd0a0', 1.55), winGlow: glow('#ffb06a', 0.85),
    }[key];
    mat.name = key;
    const m = mesh(parts, mat);
    m.name = key === 'doorGlow' || key === 'winGlow' ? `arch-lamps-${key}` : `arch-${key}`;
    grp.add(m);
  }
  scene.add(grp);
  return { group: grp, anchors, carvings, towerTiers, built: { gate, bridge, temple, southgate, tower } };
}

/* ------------------------------------------------------------------ 落位助手 */

/** 把局部几何按 rot 旋过再平移；返回同一个 geometry 以便继续塞进材质堆 */
function place(g, x, y, z, rot = 0) {
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

/** 券洞形：下半矩形、上半半圆，面在 XY、厚往 Z 两侧 */
function archPlate(w, h, thick) {
  const r = w / 2;
  const front = [[-r, 0, -thick], [r, 0, -thick]];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    front.push([Math.cos(a) * r, r * Math.sin(a), -thick]);
  }
  const back = front.map((p) => [p[0], p[1], thick]);
  const list = [...front, ...back];
  const idx = [];
  const n = front.length;
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n, c = n + i, d = n + ((i + 1) % n);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  const arr = [];
  for (const p of list) arr.push(p[0], p[1], p[2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const uvs = [];
  for (const p of list) uvs.push((p[0] + r) / (2 * r), p[1] / (r + h));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 一段筒拱：半径 r、厚 thick、沿 Z 拉出 width，用来做桥洞和门洞的内壁 */
function barrel(r, thick, width, segs = 18) {
  const parts = [];
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI * (i / segs), a1 = Math.PI * ((i + 1) / segs);
    const quad = (rr, off) => [
      [Math.cos(a0) * rr, Math.sin(a0) * rr, -width / 2 + off],
      [Math.cos(a1) * rr, Math.sin(a1) * rr, -width / 2 + off],
      [Math.cos(a1) * rr, Math.sin(a1) * rr, width / 2 + off],
      [Math.cos(a0) * rr, Math.sin(a0) * rr, width / 2 + off],
    ];
    const outer = quad(r, 0), inner = quad(r - thick, 0);
    const pos = [], uvs = [];
    for (const p of [...outer, ...inner]) pos.push(p[0], p[1], p[2]);
    for (let k = 0; k < 2; k++) {
      for (let m = 0; m < 4; m++) uvs.push((i + (m === 1 || m === 2 ? 1 : 0)) / segs, k);
    }
    const idx = [0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ 景区门楼 */

function buildGate(P, anchors, carvings, grp) {
  const { x, z } = SITE.gate;
  const y = groundAt(x, z);
  const gap = 6.6, pierW = 2.4, h = 6.0, depth = 3.2;
  // 门楼朝西（面海的一面），局部前面 -Z 转 -90° 即朝 -X
  const rot = Math.PI / 2;
  for (const s of [-1, 1]) {
    P.brick.push(place(box(pierW, h, depth, s * (gap / 2 + pierW / 2), 0, 0), x, y, z, rot));
    P.brick.push(place(box(pierW + 0.7, 0.8, depth + 0.8, s * (gap / 2 + pierW / 2), h, 0), x, y, z, rot));
  }
  P.brick.push(place(box(gap + pierW * 2 + 1.2, 1.4, depth, 0, h + 0.8, 0), x, y, z, rot));
  const roof = gabledRoof({ span: gap + 8.4, depth: depth + 1.6, rise: 1.05, eaveY: h + 2.2, lift: 0.5 });
  P.roof.push(place(roof.surface, x, y, z, rot));
  // 洞里的黑与一豆灯
  P.dark.push(place(box(gap * 0.94, h - 1.4, 0.24, 0, 0.05, 0.1), x, y, z, rot));
  anchors.push([x - 2.2, y + 2.2, z, 'interior'],
    [x, y + h - 0.6, z - 4.6, 'lantern'], [x, y + h - 0.6, z + 4.6, 'lantern']);

  const plaque = inscribed('花果山', 4.6, 1.6, {
    vertical: false, board: '#343b42', ink: '#f1e8d5', size: 0.74, glow: '#5f4b26', ei: 0.5,
  });
  plaque.position.set(x - 1.9, y + h + 1.5, z);
  plaque.rotation.y = -Math.PI / 2;
  plaque.name = 'plaque-gate';
  grp.add(plaque);
  carvings.push({ mesh: plaque, base: 0.5 });
  return { y, h, deck: y };
}

/* ------------------------------------------------------------------ 九龙桥 */

function buildBridge(P, anchors) {
  const { x, z, span, width, arch } = SITE.bridge;
  const bed = groundAt(x, z);
  const crown = bed + 5.8;            // 桥面
  const half = span / 2, hw = width / 2;
  const r = arch / 2 + 0.9;
  // 局部：桥长沿 X、桥宽沿 Z；落位时整体转 90°，让桥横切那条东西向的山涧
  const L = Math.PI / 2;
  const put = (g, lx = 0, ly = 0, lz = 0) => {
    g.rotateY(L);
    g.translate(x + lz, ly, z - lx);
    return g;
  };
  const toWorld = (lx, ly, lz) => [x + lz, ly, z - lx];

  // 拱券内壁：净跨 6.6 米的一孔
  P.brickDark.push(put(barrel(r, 1.2, width), 0, bed + 0.1, 0));
  // 拱肩与桥台
  for (const s of [-1, 1]) {
    const segW = half - r + 0.6;
    P.brick.push(put(box(segW, crown - bed + 1.1, width, s * (r + segW / 2 - 0.2), bed - 0.5, 0)));
    P.brick.push(put(box(1.8, crown - bed + 1.8, width + 1.6, s * (half - 0.6), bed - 0.8, 0)));
  }
  for (const s of [-1, 1]) P.brick.push(put(spandrel(r, crown - bed - 0.6, width, s), 0, bed + 0.1, 0));
  P.stone.push(put(box(span, 0.66, width, 0, crown, 0)));
  for (const s of [-1, 1]) {
    P.stone.push(put(box(span * 0.96, 0.8, 0.36, 0, crown + 0.66 + 0.4, s * (hw - 0.25))));
    for (let i = 0; i <= 9; i++) {
      const px = -span * 0.48 + (span * 0.96) * (i / 9);
      P.stone.push(put(box(0.4, 1.3, 0.4, px, crown + 0.66, s * (hw - 0.25))));
    }
  }
  anchors.push(
    toWorld(0, bed + r * 0.55, 0).concat('arch'),
    toWorld(-7, crown + 2.3, 0).concat('lantern'),
    toWorld(7, crown + 2.3, 0).concat('lantern'),
    toWorld(0, crown + 1.1, -hw - 1.4).concat('lamp'),
    toWorld(0, crown + 1.1, hw + 1.4).concat('lamp'),
  );
  return { bed, crown, span, width, deckY: crown + 0.66 };
}

/** 拱肩：从拱到桥面之间那两块实心的三角 */
function spandrel(r, topH, width, side) {
  const segs = 12;
  const parts = [];
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI * (0.02 + i / segs), a1 = Math.PI * (0.02 + (i + 1) / segs);
    const y0 = Math.sin(a0) * r, y1 = Math.sin(a1) * r;
    const x0 = Math.cos(a0) * r * side, x1 = Math.cos(a1) * r * side;
    const pos = [
      x0, y0, -width / 2, x1, y1, -width / 2, x1, topH, -width / 2,
      x0, y0, width / 2, x1, y1, width / 2, x1, topH, width / 2,
    ];
    const corner = [[x0, y0], [x1, y1], [x1, topH]];
    const uvs = [];
    for (const pass of [0, 1]) {
      for (const [px, py] of corner) uvs.push((px * side + r) / (2 * r), py / topH);
      void pass;
    }
    const idx = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ 三元宫 */

/**
 * "发迹于唐、重建于宋、敕赐于明"。轴线沿坡面往上，门前那串石级历代添过，
 * 这里只砌石级、不写数字。1938 年毁于兵火，今天的殿是 1980 年以后补的。
 */
function buildTemple(P, anchors, carvings, grp) {
  const { x, z } = SITE.temple;
  const rot = Math.PI / 2;                 // 前面朝 -X：一路下坡即是西
  const axis = [
    { dx: -76, w: 13.0, d: 5.0, h: 5.2, bays: 3, kind: 'gate', plaque: '敕赐护国三元宫' },
    { dx: -42, w: 14.0, d: 7.0, h: 6.0, bays: 3, kind: 'hall' },
    { dx: -8, w: 16.6, d: 9.4, h: 7.8, bays: 3, kind: 'hall', plaque: '遥镇洪流' },
    { dx: 30, w: 10.4, d: 9.0, h: 8.2, bays: 3, kind: 'loft' },
  ];
  const built = {};
  axis.forEach((b, bi) => {
    const bx = x + b.dx;
    const gy = groundAt(bx, z);
    const terrace = 1.5 + bi * 0.5;
    P.stone.push(place(box(b.d + 3.2, terrace, b.w + 3.4, 0, -terrace, 0), bx, gy + 0.1, z, rot));
    const y0 = gy + 0.1;
    // 柱网
    for (const s of [-1, 1]) {
      for (let i = 0; i < b.bays; i++) {
        const cx = -b.w / 2 + (i + 0.5) * (b.w / b.bays);
        P.timber.push(place(cyl(0.34, 0.3, b.h, 10, cx, 0, s * (b.d / 2 - 0.5)), bx, y0, z, rot));
      }
    }
    // 墙：后檐整片、两山收头、明间敞开
    P.plaster.push(place(box(b.w, b.h * 0.9, 0.42, 0, 0, b.d / 2 - 0.2), bx, y0, z, rot));
    for (const s of [-1, 1]) {
      P.plaster.push(place(box(0.45, b.h * 0.92, b.d, s * (b.w / 2 - 0.2), 0, 0), bx, y0, z, rot));
    }
    const bayW = b.w / b.bays;
    for (let i = 0; i < b.bays; i++) {
      const cx = -b.w / 2 + (i + 0.5) * bayW;
      if (i === 1) {
        P.dark.push(place(box(bayW * 0.8, b.h * 0.66, 0.18, cx, 0.05, -b.d / 2 + 0.2), bx, y0, z, rot));
        P.doorGlow.push(place(box(bayW * 0.55, b.h * 0.4, 0.1, cx, b.h * 0.14, -b.d / 2 + 1.4), bx, y0, z, rot));
        anchors.push([bx - (b.d / 2 - 2.0), y0 + b.h * 0.4, z, 'interior']);
      } else {
        P.timber.push(place(box(bayW * 0.76, b.h * 0.62, 0.26, cx, 0, -b.d / 2 + 0.2), bx, y0, z, rot));
        P.winGlow.push(place(box(bayW * 0.46, b.h * 0.3, 0.08, cx, b.h * 0.2, -b.d / 2 + 0.34), bx, y0, z, rot));
      }
    }
    // 屋顶
    const eaveY = y0 + b.h;
    if (b.kind === 'loft') {
      for (const lv of [0, 1]) {
        const sc = 1 - lv * 0.26;
        const yy = eaveY + lv * (b.h * 0.46);
        P.roof.push(place(pavilionRoof({
          half: b.w * 0.62 * sc, rise: b.h * 0.46 * sc, eaveY: yy, lift: 0.72, sides: 4,
        }).surface, bx, 0, z, rot));
        if (lv) P.plaster.push(place(box(b.w * 0.62, b.h * 0.44, b.d * 0.66, 0, yy - b.h * 0.03, 0), bx, 0, z, rot));
        else P.winGlow.push(place(box(b.w * 0.2, b.h * 0.16, 0.1, 0, yy + b.h * 0.18, -b.d * 0.4), bx, 0, z, rot));
      }
    } else {
      const r = gabledRoof({
        span: b.w * 1.18, depth: b.d + 2.4, rise: b.h * 0.44, eaveY, lift: 0.62, cornerOut: 0.82,
      });
      P.roof.push(place(r.surface, bx, 0, z, rot));
    }
    if (b.plaque) {
      const wide = b.plaque.length >= 5;
      const pl = inscribed(b.plaque, wide ? 6.4 : 4.8, wide ? 1.5 : 1.3, {
        vertical: false, board: '#2f3640', ink: '#f3ead7', size: 0.78, glow: '#6d5527', ei: 0.55,
      });
      // 门额挂在明间上方，面朝 -X
      pl.position.set(bx - b.d / 2 - 0.5, eaveY - b.h * 0.12, z);
      pl.rotation.y = -Math.PI / 2;
      pl.name = `plaque-${b.kind}-${bi}`;
      grp.add(pl);
      carvings.push({ mesh: pl, base: 0.55 });
    }
    anchors.push([bx - b.d / 2 - 1.5, y0 + b.h * 0.7, z - b.w / 2 - 1.4, 'lantern'],
      [bx - b.d / 2 - 1.5, y0 + b.h * 0.7, z + b.w / 2 + 1.4, 'lantern']);
    built[b.kind + bi] = { y0, eaveY, x: bx, z, deck: y0 };
  });

  // 宫墙：三面围住这一串殿，贴着坡面一段一段找平
  const runs = [
    [[x - 76, z - 26], [x + 44, z - 26]],
    [[x - 76, z + 26], [x + 44, z + 26]],
    [[x - 76, z - 26], [x - 76, z - 12]],      // 西墙在门口断开
    [[x - 76, z + 4], [x - 76, z + 26]],
    [[x + 44, z - 26], [x + 44, z + 26]],
  ];
  for (const [a, b] of runs) {
    const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
    for (let i = 0; i < n; i++) {
      const px = a[0] + (b[0] - a[0]) * ((i + 0.5) / n);
      const pz = a[1] + (b[1] - a[1]) * ((i + 0.5) / n);
      const y = groundAt(px, pz);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) / n + 0.4;
      const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      P.plaster.push(place(box(len, 3.8, 0.7, 0, 0, 0), px, y - 0.3, pz, ang));
      P.roof.push(place(box(len + 0.4, 0.4, 1.3, 0, 3.8, 0), px, y - 0.3, pz, ang));
    }
  }
  // 门前石级：从最低一层月台一路往下砌到坡地上
  const lowest = groundAt(x - 76, z) + 0.1;
  for (let i = 0; i < 16; i++) {
    const sx = x - 76 - 2 - i * 1.5;
    P.stone.push(box(1.5, 0.34, 5.2, sx, lowest - 0.2 - i * 0.32, z));
  }
  const plaza = built.hall2 || built.hall3;
  return { built, plazaY: plaza ? plaza.y0 : groundAt(x, z) };
}

/* ------------------------------------------------------------------ 南天门 */

function buildSouthGate(P, anchors, carvings, grp) {
  const { x, z } = SITE.southgate;
  const y = groundAt(x, z);
  const gap = 4.6, pierW = 3.2, h = 5.0;
  const rot = Math.PI / 2;                  // 门洞朝着下山的方向
  for (const s of [-1, 1]) {
    P.brick.push(place(box(pierW, h, 3.0, s * (gap / 2 + pierW / 2), 0, 0), x, y, z, rot));
  }
  P.brick.push(place(box(gap + pierW * 2 + 0.9, 1.2, 3.2, 0, h, 0), x, y, z, rot));
  P.brickDark.push(place(barrel(gap / 2 + 0.6, 0.7, 3.0, 12), x, y + 0.05, z, rot));
  P.dark.push(place(box(gap * 0.9, h - 1.2, 0.22, 0, 0.05, 0.4), x, y, z, rot));
  const roof = gabledRoof({ span: gap + 7.4, depth: 4.4, rise: 0.85, eaveY: h + 1.2, lift: 0.42 });
  P.roof.push(place(roof.surface, x, y, z, rot));
  const pl = inscribed('高镇南天', 4.2, 1.35, {
    vertical: false, board: '#3d4348', ink: '#efe5d0', size: 0.78, glow: '#6f5c31', ei: 0.6,
  });
  pl.position.set(x - 1.9, y + h + 0.45, z);
  pl.rotation.y = -Math.PI / 2;
  pl.name = 'plaque-southgate';
  grp.add(pl);
  carvings.push({ mesh: pl, base: 0.6 });
  anchors.push([x - 2.4, y + h - 1.1, z - 3.6, 'lantern'], [x - 2.4, y + h - 1.1, z + 3.6, 'lantern'],
    [x, y + 1.5, z, 'interior']);
  return { y, h };
}

/* ------------------------------------------------------------------ 海清寺塔 */

/**
 * 九级八面仿楼阁式砖塔，通高 40.58 米，塔门朝南。每层四面辟券门、四面设直棂
 * 假窗，并随层位错开——会亮的是门，不会亮的是窗。
 */
function buildTower(grp, P, anchors, tiers) {
  const { x, z, height, storeys } = SITE.pagoda;
  const y0 = groundAt(x, z);
  const spire = 4.6;
  const per = (height - spire - 1.9) / storeys;
  const baseR = 5.4;

  for (let i = 0; i < 2; i++) {
    const r = baseR + 2.0 - i * 1.0;
    const yb = y0 - 0.7 + i * 1.0;
    // 单层截面的 loft 会算出 0/0，台基一律给上下两道
    P.stone.push(loft([
      { y: yb, cx: x, cz: z, sx: r, sz: r },
      { y: yb + 1.06, cx: x, cz: z, sx: r, sz: r },
    ], roundedSection(0.14, 2), { uvScale: 3 }));
  }
  for (let s = 0; s < storeys; s++) {
    const k = s / (storeys - 1);
    const r = baseR * (1 - 0.42 * k);
    const yb = y0 + 1.9 + s * per;
    const hh = per * (s === storeys - 1 ? 1.08 : 1);
    P.brick.push(loft([
      { y: yb, cx: x, cz: z, sx: r, sz: r },
      { y: yb + hh, cx: x, cz: z, sx: r * 0.95, sz: r * 0.95 },
    ], octagon(), { uvScale: 3.4 }));
    // 腰檐
    const eaveR = r * 1.34;
    P.brick.push(loft([
      { y: yb + hh, cx: x, cz: z, sx: eaveR, sz: eaveR },
      { y: yb + hh + 0.62, cx: x, cz: z, sx: eaveR * 0.86, sz: eaveR * 0.86 },
    ], octagon(), { uvScale: 3 }));
    // 平座栏板（下八层有绕柱回廊）
    if (s < storeys - 1) {
      P.stone.push(loft([
        { y: yb + hh + 0.62, cx: x, cz: z, sx: eaveR * 0.84, sz: eaveR * 0.84 },
        { y: yb + hh + 1.34, cx: x, cz: z, sx: eaveR * 0.84, sz: eaveR * 0.84 },
      ], octagon(), { uvScale: 3, capTop: false, capBottom: false }));
    }
    const doorParts = [];
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2;              // a=0 即 +Z，也就是南
      const isDoor = (f + s) % 2 === 0;
      const nx = Math.sin(a), nz = Math.cos(a);
      const px = x + nx * r, pz = z + nz * r;
      if (isDoor) {
        const wgt = Math.min(1.55, r * 0.36), hgt = Math.min(hh * 0.66, 2.6);
        P.dark.push(place(archPlate(wgt, hgt, 0.34), px - nx * 0.1, yb + 0.08, pz - nz * 0.1, a));
        const inner = archPlate(wgt * 0.74, hgt * 0.8, 0.06);
        // 每一层的门各自成网格，"九级次第"才点得动
        doorParts.push(place(inner, px - nx * 0.85, yb + 0.16, pz - nz * 0.85, a));
      } else {
        const wgt = Math.min(1.2, r * 0.3), hgt = Math.min(hh * 0.46, 1.7);
        P.brickDark.push(place(box(wgt, hgt, 0.3, 0, 0, 0), px - nx * 0.35, yb + hh * 0.34, pz - nz * 0.35, a));
        for (let b = 0; b < 4; b++) {
          const off = (b - 1.5) * (wgt / 4.6);
          P.timber.push(place(box(0.13, hgt * 0.92, 0.16, off, 0, 0.06),
            px - nx * 0.1, yb + hh * 0.34, pz - nz * 0.1, a));
        }
      }
    }
    const tierMat = glow('#ffd0a0', 1.4);
    const tierMesh = mesh(doorParts, tierMat);
    tierMesh.name = `tower-tier-${s}`;
    grp.add(tierMesh);
    tiers.push({ index: s, y: yb + 0.2, mesh: tierMesh, mat: tierMat, on: 1, apex: [x, yb, z] });
  }
  const topY = y0 + 1.9 + storeys * per;
  P.stone.push(loft([
    { y: topY, cx: x, cz: z, sx: 1.15, sz: 1.15 },
    { y: topY + 0.9, cx: x, cz: z, sx: 0.6, sz: 0.6 },
  ], circleSection(10), { uvScale: 2 }));
  P.gold.push(cyl(0.14, 0.2, 2.6, 8, x, topY + 0.8, z));
  for (let i = 1; i <= 3; i++) P.gold.push(cyl(0.85 - i * 0.19, 0.95 - i * 0.19, 0.26, 12, x, topY + 2.4 + i * 0.52, z));
  anchors.push([x, y0 + 2.4, z + baseR + 2.6, 'lamp'], [x - 9, y0 + 1.5, z + 5, 'lamp'],
    [x + 8, y0 + 1.5, z - 4, 'lamp']);
  return { y0, topY: topY + 4.4, baseR, per };
}

function octagon() {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.sin(a), Math.cos(a)]);
  }
  return pts;
}

function circleSection(seg = 12) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([Math.sin(a), Math.cos(a)]);
  }
  return pts;
}
