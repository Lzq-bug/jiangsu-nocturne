import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, inscribed, rand, rr, box, cyl, loft, blobGeometry } from './kit.js';
import { gabledRoof, pavilionRoof, slopeEndWall, wallCap } from './roofs.js';
import * as T from './textures.js';
import { TEMPLE, TOMB, PADS, ROAD, heightAt, site, roadAt } from './data.js';

/**
 * 山顶广教寺群、支云塔、半山山门、西崖亭台、东南麓墓区、临江摩崖。
 * 建筑都落在 data.js 的台地上，地面高一律由 heightAt 取——改台地它们就跟着动。
 *
 * 塔的形制按资料摆：四面五级、砖木楼阁、逐层收分、每层绕木栏、刹顶相轮七重
 * 加宝珠与金铎，通高配到 35 米（25.7 米一说写进解说）。
 */

const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const HALF_PI = Math.PI / 2;

const C = {
  stone: [], paving: [], brick: [], timber: [], dark: [], plaster: [], temple: [],
  roof: [], ridge: [], gold: [], stele: [], rock: [], moss: [],
};
const add = (k, ...geos) => { for (const g of geos) if (g) C[k].push(g); };

/** 不能合并的东西：窗、匾、发光面、精灵 */
const extras = [];
export const eaves = [];
export const windowSheets = [];

function put(g, x, y, z, rot = 0) {
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}
/** 局部（x 沿面阔、z 朝前）→ 世界 */
function at(x, z, rot, lx, lz) {
  return [x + Math.cos(rot) * lx + Math.sin(rot) * lz, z - Math.sin(rot) * lx + Math.cos(rot) * lz];
}
/** 让一张 +Z 朝向的面转到外法线 (nx,nz) */
const faceRot = (nx, nz) => Math.atan2(nx, nz);

/* ------------------------------------------------------------------ 构件 */

/** 台基：往下多埋 8 米，山地台上各处高差几米都不怕基座悬空 */
function plinth({ x, z, rot, w, d, baseY, h = 0.7, steps = 2, skirt = 8 }) {
  add('stone', put(bx(w, h + skirt, d), x, baseY - skirt / 2 + h / 2, z, rot));
  add('stone', put(bx(w + 0.36, 0.18, d + 0.36), x, baseY + h - 0.02, z, rot));
  for (let k = 0; k < steps; k++) {
    const [sx, sz] = at(x, z, rot, 0, d / 2 + 0.54 + k * 0.48);
    add('stone', put(bx(w * 0.42, 0.2, 0.54), sx, baseY + h - (k + 1) * 0.2 + 0.1, sz, rot));
  }
}

function colonnade({ x, z, rot, xs, zs, baseY, h, r = 0.26, stone = false }) {
  for (const lx of xs) for (const lz of zs) {
    const [px, pz] = at(x, z, rot, lx, lz);
    add(stone ? 'stone' : 'timber', put(new THREE.CylinderGeometry(r * 0.9, r, h, 10), px, baseY + h / 2, pz));
    if (!stone) add('stone', put(bx(r * 2.6, 0.18, r * 2.6), px, baseY + 0.09, pz, rot));
  }
}

function entablature({ x, z, rot, w, d, y }) {
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * d / 2);
    add('timber', put(bx(w + 0.34, 0.34, 0.24), px, y - 0.22, pz, rot));
    const [qx, qz] = at(x, z, rot, 0, sz * (d / 2 + 0.4));
    add('dark', put(bx(w + 1.2, 0.2, 0.2), qx, y + 0.05, qz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * w / 2, 0);
    add('timber', put(bx(0.24, 0.34, d), px, y - 0.22, pz, rot));
  }
}

function valance({ x, z, rot, w, d, y }) {
  for (const sz of [-1, 1]) {
    const [fx, fz] = at(x, z, rot, 0, sz * (d / 2 + 0.12));
    add('dark', put(bx(w, 0.44, 0.08), fx, y - 0.64, fz, rot));
    const n = Math.max(4, Math.round(w / 0.66));
    for (let i = 0; i <= n; i++) {
      const [px, pz] = at(fx, fz, rot, -w / 2 + (i * w) / n, 0);
      add('dark', put(bx(0.1, i % 2 ? 0.26 : 0.42, 0.08), px, y - 0.96, pz, rot));
    }
  }
}

/** 两坡瓦顶。eaveY 必须是绝对高程，传 0 会把整个屋顶埋进土里 */
function roof({ x, z, rot, span, depth, rise, eaveY, lift = 0.6, cornerOut = 0.85, lamps = true }) {
  const r = gabledRoof({ span, depth, rise, eaveY, lift, cornerOut });
  add('roof', put(r.surface, x, 0, z, rot));
  add('ridge', put(r.ridge, x, 0, z, rot));
  add('dark', put(bx(span + 1.4, 0.16, depth + 1.2), x, eaveY - 0.36, z, rot));
  if (!lamps) return;
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (span / 2 - 1.0), depth / 2 - 0.2);
    eaves.push({ x: px, y: eaveY + lift * 0.35, z: pz });
  }
}

function plaque(text, { x, z, rot, y, front, w, h, board = '#241610', ink = '#e8d3a4', glow: g = '#ffcf94', ei = 0.3 }) {
  const [px, pz] = at(x, z, rot, 0, front);
  const m = inscribed(text, w, h, { vertical: false, cols: 1, board, ink, size: 0.74, glow: g, ei });
  m.position.set(px, y, pz);
  m.rotation.y = rot;
  extras.push(m);
  if (board) {
    const frame = new THREE.Mesh(bx(w + 0.22, h + 0.2, 0.12), M.gold);
    frame.position.set(px - 0.09 * Math.sin(rot), y, pz - 0.09 * Math.cos(rot));
    frame.rotation.y = rot;
    extras.push(frame);
  }
  return m;
}

/** 一扇透光的窗：纸在后、棂条在前，纸归 windowSheets 统一呼吸 */
function windowPanel({ x, y, z, rot, w = 1.6, h = 2.0, kind = 0 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.windowPaper.clone());
  const bars = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    color: new THREE.Color('#38302a'), alphaMap: T.lattice(kind), transparent: true, alphaTest: 0.42,
    roughness: 0.84, side: THREE.DoubleSide, emissive: new THREE.Color('#0b0e12'), emissiveIntensity: 0.5,
  }));
  bars.position.z = 0.1;
  const frame = new THREE.Mesh(mergeGeometries([
    bx(w + 0.3, 0.16, 0.5).translate(0, h / 2 + 0.08, 0),
    bx(w + 0.3, 0.14, 0.5).translate(0, -h / 2 - 0.07, 0),
    bx(0.14, h, 0.44).translate(-w / 2 - 0.07, 0, 0),
    bx(0.14, h, 0.44).translate(w / 2 + 0.07, 0, 0),
  ]), M.stone);
  g.add(sheet, bars, frame);
  windowSheets.push({ mesh: sheet, base: 0.42, phase: rand() * 6.28 });
  extras.push(g);
  return g;
}

/* ------------------------------------------------------------------ 殿 */

function hall({ x, z, rot = 0, bays = 3, bayW = 4.4, depth = 7.6, colH = 4.6, baseY, name = null, yellow = true, rise = 1.9, deck = 2.4 }) {
  const span = bays * bayW;
  const floor = baseY + 0.75;
  const wall = yellow ? 'temple' : 'plaster';
  plinth({ x, z, rot, w: span + 2.6, d: depth + 2.2, baseY, h: 0.75, steps: 3 });
  // 月台：往外挑 deck 米，底下同样埋下去，台上就是一片平场
  add('paving', put(bx(span + deck * 2 + 2, 0.5, depth + deck * 2 + 2), x, baseY - 2 + 0.25, z, rot));
  add('plaster', put(bx(span, 0.14, depth), x, floor + 0.07, z, rot));
  const xs = [];
  for (let i = 0; i <= bays; i++) xs.push(-span / 2 + i * bayW);
  colonnade({ x, z, rot, xs, zs: [-depth / 2, depth / 2], baseY: floor, h: colH, r: 0.28 });
  const eaveY = floor + colH + 0.24;
  entablature({ x, z, rot, w: span, d: depth, y: eaveY });
  valance({ x, z, rot, w: span, d: depth, y: eaveY });

  const [bx1, bz1] = at(x, z, rot, 0, -depth / 2);
  add(wall, put(bx(span + 0.3, colH, 0.45), bx1, floor + colH / 2, bz1, rot));
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * span / 2, 0);
    add(wall, put(bx(0.45, colH, depth), px, floor + colH / 2, pz, rot));
    const [wx, wz] = at(x, z, rot, sx * (span / 2 + 0.26), depth * 0.14);
    windowPanel({ x: wx, y: floor + colH * 0.55, z: wz, rot: faceRot(sx, 0), w: 1.7, h: 2.1, kind: 1 });
  }
  // 前檐开敞：槅扇退到柱外，当中一道背光屏风
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (span / 2 - 0.8), depth / 2 + 0.36);
    add('dark', put(bx(1.6, colH - 0.9, 0.12), px, floor + (colH - 0.9) / 2 + 0.4, pz, rot + sx * 1.3));
  }
  const [s1, s2] = at(x, z, rot, 0, -depth * 0.24);
  add('dark', put(bx(span * 0.72, colH - 1.2, 0.2), s1, floor + (colH - 1.2) / 2 + 0.25, s2, rot));
  const screen = new THREE.Mesh(bx(span * 0.52, colH - 2.1, 0.08), glow('#b8763a', 0.24));
  screen.position.set(s1, floor + (colH - 2.1) / 2 + 0.55, s2 + 0.24 * Math.cos(rot));
  screen.rotation.y = rot;
  screen.name = 'hall-screen';
  extras.push(screen);

  roof({ x, z, rot, span: span + 3.6, depth: depth + 3.2, rise, eaveY, lift: 0.72, cornerOut: 1.15 });
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * (span / 2 + 0.24), 0);
    add(wall, put(slopeEndWall({ depth: depth + 0.8, rise, baseY: floor, eaveY, thick: 0.4, pitch: 0.8 }), px, 0, pz, rot));
  }
  if (name) plaque(name, { x, z, rot, y: eaveY - 0.95, front: depth / 2 + 0.86, w: 2.4, h: 0.8 });
  const [fx, fz] = at(x, z, rot, 0, depth / 2 + 2.4);
  return { eaveY, floor, front: [fx, fz] };
}

/** 二层小楼（萃景楼） */
function storeyBuilding({ x, z, rot = 0, w, d, baseY, name = null }) {
  const h1 = 4.0, y1 = baseY + 0.5;
  plinth({ x, z, rot, w: w + 1.8, d: d + 1.6, baseY, h: 0.5 });
  add('plaster', put(bx(w, 0.14, d), x, y1 + 0.07, z, rot));
  colonnade({ x, z, rot, xs: [-w / 2, w / 2], zs: [-d / 2, d / 2], baseY: y1, h: h1, r: 0.25 });
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * d / 2);
    add('temple', put(bx(w, h1, 0.42), px, y1 + h1 / 2, pz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * w / 2, 0);
    add('temple', put(bx(0.42, h1, d), px, y1 + h1 / 2, pz, rot));
  }
  const e1 = y1 + h1 + 0.2, deck = e1 + 0.7;
  const waist = gabledRoof({ span: w + 2.8, depth: d + 2.8, rise: 0.62, eaveY: deck - 0.62, lift: 0.34, cornerOut: 0.7 });
  add('roof', put(waist.surface, x, 0, z, rot));
  add('ridge', put(waist.ridge, x, 0, z, rot));
  add('dark', put(bx(w + 2, 0.14, d + 2), x, deck - 0.92, z, rot));
  add('stone', put(bx(w + 1.5, 0.22, d + 1.5), x, deck - 0.11, z, rot));
  for (const sz of [-1, 1]) {
    const [px, pz] = at(x, z, rot, 0, sz * (d / 2 + 0.62));
    add('timber', put(bx(w + 1.2, 0.1, 0.1), px, deck + 0.94, pz, rot));
    for (let i = 0; i <= 8; i++) {
      const [qx, qz] = at(px, pz, rot, -(w + 1.1) / 2 + (i * (w + 1.1)) / 8, 0);
      add('timber', put(bx(0.1, 0.96, 0.1), qx, deck + 0.48, qz, rot));
    }
  }
  const h2 = 3.3;
  colonnade({ x, z, rot, xs: [-w / 2 + 0.5, w / 2 - 0.5], zs: [-d / 2 + 0.5, d / 2 - 0.5], baseY: deck, h: h2, r: 0.22 });
  {
    const [px, pz] = at(x, z, rot, 0, -d / 2 + 0.5);
    add('temple', put(bx(w - 0.9, h2, 0.4), px, deck + h2 / 2, pz, rot));
  }
  const e2 = deck + h2 + 0.18;
  entablature({ x, z, rot, w: w - 0.9, d: d - 0.9, y: e2 });
  roof({ x, z, rot, span: w + 1.8, depth: d + 1.5, rise: 1.4, eaveY: e2, lift: 0.55, cornerOut: 0.8 });
  const [wx, wz] = at(x, z, rot, 0, d / 2 - 0.3);
  windowPanel({ x: wx, y: deck + h2 * 0.55, z: wz, rot, w: 1.6, h: 1.6, kind: 3 });
  if (name) plaque(name, { x, z, rot, y: e2 - 0.82, front: d / 2 - 0.1, w: 1.7, h: 0.64 });
  return { eaveY: e2, deck };
}

/* ------------------------------------------------------------------ 支云塔 */

const FACES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * 四面五级楼阁式砖塔。通高按 35 米配：台基 1.6 + 五层 25 + 刹 8.4。
 * 每层的窗光是一张 glow 面，归 levels[i] 管——袈裟遮山时逐层点亮。
 */
function pagoda({ x, z, baseY, rot = 0 }) {
  const grp = new THREE.Group();
  const plinthH = 1.6, levelH = 5.0, levels = 5;
  const halfBase = 6.4, halfTop = 4.1;

  add('stone', put(bx(halfBase * 2 + 4.6, plinthH, halfBase * 2 + 4.6), x, baseY + plinthH / 2, z, rot));
  add('paving', put(bx(halfBase * 2 + 3.2, 0.22, halfBase * 2 + 3.2), x, baseY + plinthH + 0.11, z, rot));

  const lv = [];
  for (let i = 0; i <= levels; i++) {
    const s = halfBase + (halfTop - halfBase) * (i / levels);
    lv.push({ y: baseY + plinthH + i * levelH, cx: x, cz: z, sx: s, sz: s });
  }
  add('brick', loft(lv, [[-1, -1], [1, -1], [1, 1], [-1, 1]], { uvScale: 3.2 }));

  const mats = [];
  for (let i = 0; i < levels; i++) {
    const y0 = baseY + plinthH + i * levelH;
    const s = halfBase + (halfTop - halfBase) * (i / levels);
    const mat = glow('#ffbe7c', 0.9);
    mats.push({ mat, base: 0.9, on: 1, y: y0 + levelH * 0.5 });

    // 平座与木栏
    add('stone', put(bx(s * 2 + 2.6, 0.26, s * 2 + 2.6), x, y0 + levelH - 0.13, z, rot));
    for (const [nx, nz] of FACES) {
      const px = x + nx * (s + 1.1), pz = z + nz * (s + 1.1);
      const railLen = (s + 1.0) * 2;
      const g = nx === 0 ? bx(railLen, 0.09, 0.1) : bx(0.1, 0.09, railLen);
      add('timber', put(g, px, y0 + levelH + 0.82, pz, 0));
      for (let k = 0; k <= 6; k++) {
        const t = -1 + (2 * k) / 6;
        const ox = nx === 0 ? t * s : 0, oz = nx === 0 ? 0 : t * s;
        add('timber', put(bx(0.09, 0.8, 0.09), x + nx * (s + 1.1) + ox, y0 + levelH + 0.42, z + nz * (s + 1.1) + oz, 0));
      }
    }

    // 腰檐
    const eaveY = y0 + levelH + 0.06;
    const pr = pavilionRoof({ half: s + 2.6, rise: 1.5, eaveY, lift: 0.95, cornerOut: 0.9, sides: 4, perSide: 8, nv: 9 });
    add('roof', put(pr.surface, x, 0, z, rot + Math.PI / 4));
    for (let c = 0; c < 4; c++) {
      const a = rot + Math.PI / 4 + (c + 0.5) * HALF_PI;
      const hx = x + Math.cos(a) * (s + 2.6) * 1.12, hz = z + Math.sin(a) * (s + 2.6) * 1.12;
      add('gold', put(new THREE.CylinderGeometry(0.09, 0.05, 0.46, 6), hx, eaveY - 0.26, hz));
      add('gold', put(blobGeometry(0.2, { detail: 0, amp: 0.2, squash: 1.35, seed: c + i * 4 }), hx, eaveY - 0.66, hz));
      eaves.push({ x: hx, y: eaveY - 0.85, z: hz, kind: 'duo' });
    }

    // 四面一朵壸门：暗龛 + 亮面
    for (const [nx, nz] of FACES) {
      const w = 1.6 + 0.5 * (1 - i / levels), h = 2.5 + 0.6 * (1 - i / levels);
      const ry = faceRot(nx, nz);
      const niche = new THREE.Mesh(bx(w, h, 0.18), M.ink);
      niche.position.set(x + nx * (s - 0.06), y0 + levelH * 0.5, z + nz * (s - 0.06));
      niche.rotation.y = ry;
      grp.add(niche);
      const light = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.82), mat);
      light.position.set(x + nx * (s + 0.08), y0 + levelH * 0.5, z + nz * (s + 0.08));
      light.rotation.y = ry;
      grp.add(light);
      add('brick', put(bx(w + 0.8, 0.26, 0.36), x + nx * (s + 0.02), y0 + levelH * 0.5 + h / 2 + 0.14, z + nz * (s + 0.02), ry));
    }
  }

  // 塔顶与刹
  const topY = baseY + plinthH + levels * levelH;
  const cap = pavilionRoof({ half: halfTop + 1.7, rise: 1.8, eaveY: topY + 0.06, lift: 0.85, cornerOut: 0.75, sides: 4, perSide: 8, nv: 9 });
  add('roof', put(cap.surface, x, 0, z, rot + Math.PI / 4));
  add('gold', put(new THREE.SphereGeometry(1.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, topY + 2.1, z));
  let fy = topY + 2.6;
  for (let i = 0; i < 7; i++) add('gold', put(new THREE.CylinderGeometry(0.95 - i * 0.1, 0.95 - i * 0.1, 0.3, 14), x, fy + i * 0.52, z));
  fy += 7 * 0.52 + 0.3;
  add('gold', put(new THREE.CylinderGeometry(0.13, 0.17, 1.2, 8), x, fy + 0.2, z));
  const top = fy + 0.9;
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), glow('#fff0c4', 2.4));
  pearl.position.set(x, top, z);
  pearl.name = 'finial-pearl';
  grp.add(pearl);
  const crown = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,224,164', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  crown.scale.set(17, 17, 1);
  crown.position.set(x, top, z);
  crown.name = 'beam-finial';
  grp.add(crown);

  return { group: grp, mats, top: { x, y: top, z }, height: top - baseY, levelYs: lv.slice(0, levels).map((l) => l.y) };
}

/* ------------------------------------------------------------------ 山门 · 坊 · 墓 */

/** 门楼式山门：三洞、四柱、一张瓦顶，额在明间 */
function mountainGate({ x, z, rot, width = 5.2, height = 4.4, name = null }) {
  const base = heightAt(x, z);
  const pier = 1.0, deep = 1.6;
  add('stone', put(bx(width + 3.4, 0.44, deep + 2.4), x, base + 0.22, z, rot));
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * width / 2, 0);
    add('temple', put(bx(pier, height, deep), px, base + height / 2 + 0.44, pz, rot));
    add('stone', put(bx(pier + 0.4, 0.3, deep + 0.4), px, base + 0.6, pz, rot));
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = at(x, z, rot, sx * width * 0.19, 0);
    add('temple', put(bx(0.82, height * 0.86, deep * 0.9), px, base + height * 0.43 + 0.44, pz, rot));
  }
  const lintelY = base + height + 0.44;
  add('dark', put(bx(width + 1.6, 0.46, deep + 0.5), x, lintelY, z, rot));
  add('plaster', put(bx(width * 0.42, height * 0.44, 0.4), x, lintelY - height * 0.3, z, rot));
  roof({ x, z, rot, span: width + 3.6, depth: deep + 3.4, rise: 1.25, eaveY: lintelY + 0.55, lift: 0.52, cornerOut: 0.75 });
  if (name) plaque(name, { x, z, rot, y: lintelY - height * 0.26, front: 0.36, w: 2.1, h: 0.72 });
  return { lintelY, deck: base + 0.44, base };
}

/** 四柱三间门楼式石坊（墓前），坊额嵌那道碑 */
function archway({ x, y, z, rot, name = null, record = null }) {
  const w = 8.8, h = 4.4, pier = 0.74;
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(bx(pier, h, pier).translate(sx * w / 2, h / 2, 0));
    parts.push(bx(pier + 0.6, 0.44, pier + 0.6).translate(sx * w / 2, 0.22, 0));
  }
  for (const sx of [-0.5, 0.5]) parts.push(bx(pier * 0.6, h * 0.76, pier * 0.6).translate(sx * w / 2, h * 0.38, 0));
  parts.push(bx(w + 1.4, 0.5, 0.96).translate(0, h + 0.1, 0));
  parts.push(bx(w * 0.5, 1.5, 0.8).translate(0, h + 1.05, 0));
  parts.push(bx(w + 0.8, 0.3, 0.9).translate(0, h + 1.95, 0));
  for (const sx of [-1, 1]) parts.push(bx(w * 0.28, 0.28, 0.8).translate(sx * w * 0.32, h + 1.95, 0));
  const m = new THREE.Mesh(mergeGeometries(parts), M.stone);
  m.position.set(x, y, z);
  m.rotation.y = rot;
  extras.push(m);

  const cap = new THREE.Mesh(gabledRoof({ span: w * 0.54, depth: 2.1, rise: 0.55, eaveY: y + h + 2.1, lift: 0.3, cornerOut: 0.5 }).surface, M.roof);
  cap.position.set(x, 0, z);
  cap.rotation.y = rot;
  extras.push(cap);

  if (record) {
    const b = inscribed(record, 6.0, 0.8, { vertical: false, cols: 1, board: null, ink: '#dfe3dd', size: 0.8, glow: '#ffbe7a', ei: 0.18 });
    b.position.set(x, y + h + 1.05, z + 0.44 * Math.cos(rot));
    b.rotation.y = rot;
    extras.push(b);
    const back = b.clone();
    back.position.z = z - 0.44 * Math.cos(rot);
    back.rotation.y = rot + Math.PI;
    extras.push(back);
  }
  if (name) {
    const b = inscribed(name, 3.4, 0.66, { vertical: false, cols: 1, board: '#767c7a', ink: '#1e242a', size: 0.8, glow: '#ffc27e', ei: 0.14 });
    b.position.set(x, y + h - 0.16, z + 0.5 * Math.cos(rot));
    b.rotation.y = rot;
    extras.push(b);
  }
}

/** 封土墓：半球 + 环形矮墙 + 一块小碑（翁仲按通行墓制补配，记载里没有） */
function mound({ x, y, z, r = 2.7, stele = null, figures = false }) {
  const parts = [
    bx(r * 2 + 3.4, 0.5, r * 2 + 3.4).translate(0, 0.25, 0),
    bx(r * 2 + 4, 0.2, r * 2 + 4).translate(0, 0.55, 0),
  ];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = bx(0.44, 0.84, 1.15);
    g.rotateY(-a);
    g.translate(Math.cos(a) * (r + 1.3), 0.95, Math.sin(a) * (r + 1.3));
    parts.push(g);
  }
  const wall = new THREE.Mesh(mergeGeometries(parts), M.stone);
  wall.position.set(x, y, z);
  extras.push(wall);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 11, 0, Math.PI * 2, 0, Math.PI / 2), M.moss);
  dome.position.set(x, y + 0.6, z);
  extras.push(dome);
  if (stele) {
    const s = new THREE.Mesh(mergeGeometries([
      bx(1.6, 2.6, 0.3).translate(0, 1.6, 0),
      bx(2.0, 0.32, 0.7).translate(0, 0.16, 0),
      bx(1.8, 0.44, 0.46).translate(0, 3.05, 0),
    ]), M.stele);
    s.position.set(x - r - 3.2, y + 0.6, z);
    extras.push(s);
    const face = inscribed(stele, 1.2, 2.3, { vertical: false, cols: 1, board: null, ink: '#e4e8e2', size: 0.82, glow: '#ffbf7e', ei: 0.24 });
    face.position.set(x - r - 3.2 + 0.18, y + 2.15, z);
    face.rotation.y = -HALF_PI;
    extras.push(face);
  }
  if (figures) {
    const body = mergeGeometries([
      cyl(0.36, 0.28, 1.5, 8, 0, 0.75, 0),
      bx(0.82, 1.1, 0.44).translate(0, 2.05, 0),
      new THREE.SphereGeometry(0.27, 10, 8).translate(0, 2.78, 0),
      bx(0.94, 0.2, 0.62).translate(0, 1.52, 0),
    ]);
    for (const sz of [-1, 1]) {
      const f = new THREE.Mesh(body, M.rockPlain);
      f.position.set(x - r - 5.4, y + 0.6, z + sz * 2.6);
      extras.push(f);
    }
  }
}

/* ------------------------------------------------------------------ 摩崖 */

/** 一面朝江的石壁 + 三个大字，壁根两盏低灯斜着扫上去 */
function cliffInscription({ x, z, rot, w = 24, h = 12, text = '第一山' }) {
  const y = heightAt(x, z);
  const parts = [
    bx(w, h, 3).translate(0, h / 2 - 1.4, 0),
    bx(w * 1.06, 0.7, 4.2).translate(0, h * 0.58, -0.6),
    bx(w * 1.1, 0.7, 4.6).translate(0, h * 0.26, -0.8),
  ];
  for (let i = 0; i < 5; i++) {
    const g = blobGeometry(2.6 + i * 0.9, { detail: 1, amp: 0.34, squash: 0.62, seed: 300 + i });
    g.translate(-w / 2 + (i + 0.5) * (w / 5), h * 0.06 + (i % 2) * 1.4, -2.2);
    parts.push(g);
  }
  const wall = new THREE.Mesh(mergeGeometries(parts), M.rockFace);
  wall.position.set(x, y, z);
  wall.rotation.y = rot;
  extras.push(wall);

  const face = inscribed(text, w * 0.42, h * 0.66, {
    vertical: false, cols: 1, board: null, ink: '#efe7d6', size: 0.84, glow: '#ffdcae', ei: 0.26,
  });
  face.position.set(x + Math.sin(rot) * 1.7, y + h * 0.44, z + Math.cos(rot) * 1.7);
  face.rotation.y = rot;
  extras.push(face);
  return { baseY: y, top: { x, y: y + h, z }, lamps: [
    { x: x + Math.sin(rot) * 4.6 + 2.2 * Math.cos(rot), y, z: z + Math.cos(rot) * 4.6 - 2.2 * Math.sin(rot) },
    { x: x + Math.sin(rot) * 4.6 - 2.2 * Math.cos(rot), y, z: z + Math.cos(rot) * 4.6 + 2.2 * Math.sin(rot) },
  ] };
}

/* ------------------------------------------------------------------ 亭 · 台 */

/** 八角重檐亭 */
function octagonPavilion({ x, z, baseY, rot = 0, half = 2.9, name = null }) {
  const grp = new THREE.Group();
  const stone = new THREE.Mesh(mergeGeometries([
    bx(half * 2 + 3.8, 0.34, half * 2 + 3.8).translate(0, 0.17, 0),
    bx(half * 2 + 2.6, 0.16, half * 2 + 2.6).translate(0, 0.42, 0),
  ]), M.stone);
  stone.position.set(x, baseY, z);
  stone.rotation.y = rot;
  grp.add(stone);

  const G = baseY + 0.5, colH = 3.6;
  const cols = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const px = x + Math.cos(a) * half * 1.3, pz = z + Math.sin(a) * half * 1.3;
    cols.push([px, pz]);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, colH, 10), M.timber);
    c.position.set(px, G + colH / 2, pz);
    grp.add(c);
  }
  // 座栏
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4 + Math.PI / 8, a1 = ((i + 1) * Math.PI) / 4 + Math.PI / 8;
    const x0 = x + Math.cos(a0) * half * 1.3, z0 = z + Math.sin(a0) * half * 1.3;
    const x1 = x + Math.cos(a1) * half * 1.3, z1 = z + Math.sin(a1) * half * 1.3;
    const len = Math.hypot(x1 - x0, z1 - z0), rr2 = Math.atan2(-(z1 - z0), x1 - x0);
    const g = bx(len, 0.09, 0.09);
    g.rotateY(rr2);
    g.translate((x0 + x1) / 2, G + 0.92, (z0 + z1) / 2);
    grp.add(new THREE.Mesh(g, M.timber));
  }
  const e1 = G + colH + 0.12;
  add('roof', put(pavilionRoof({ half: half + 2.5, rise: 1.5, eaveY: e1, lift: 1.0, cornerOut: 0.85, sides: 8, perSide: 8, nv: 9 }).surface, x, 0, z, rot));
  add('dark', put(bx(half * 2.8, 0.18, half * 2.8), x, e1 - 0.46, z, rot));
  add('roof', put(pavilionRoof({ half: half * 0.8 + 1.4, rise: 1.7, eaveY: e1 + 1.6, lift: 0.95, cornerOut: 0.75, sides: 8, perSide: 8, nv: 9 }).surface, x, 0, z, rot));
  add('gold', put(new THREE.SphereGeometry(0.32, 12, 10), x, e1 + 3.5, z));
  eaves.push({ x: x + half * 1.5, y: e1 + 0.3, z: z + half * 1.5 });
  eaves.push({ x: x - half * 1.5, y: e1 + 0.3, z: z - half * 1.5 });
  if (name) {
    const b = inscribed(name, 1.9, 0.62, { vertical: false, cols: 1, board: '#22160f', ink: '#eadbb6', size: 0.76, glow: '#ffcf94', ei: 0.3 });
    b.position.set(x, e1 - 0.95, z + half * 1.35);
    grp.add(b);
  }
  return { group: grp, eaveY: e1 + 3.6, cols };
}

/** 一方临崖石台（大观台）：平座加三面栏杆 */
function terrace({ x, z, baseY, w = 13, d = 9, rot = 0 }) {
  const parts = [
    bx(w, 0.55, d).translate(0, 0.27, 0),
    bx(w + 0.7, 0.18, d + 0.7).translate(0, 0.62, 0),
  ];
  const rails = [];
  const rh = 1.0;
  const edges = [
    { ax: -w / 2, az: d / 2, bx: w / 2, bz: d / 2 },
    { ax: -w / 2, az: -d / 2, bx: w / 2, bz: -d / 2 },
    { ax: -w / 2, az: -d / 2, bx: -w / 2, bz: d / 2 },
    { ax: w / 2, az: -d / 2, bx: w / 2, bz: d / 2 },
  ];
  for (const e of edges) {
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
    const n = Math.max(3, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const lx = e.ax + (e.bx - e.ax) * t, lz = e.az + (e.bz - e.az) * t;
      parts.push(bx(0.22, rh, 0.22).translate(lx, 0.71 + rh / 2, lz));
      parts.push(bx(0.34, 0.16, 0.34).translate(lx, 0.71 + rh + 0.08, lz));
    }
    const rr2 = Math.atan2(-(e.bz - e.az), e.bx - e.ax);
    const g = bx(len, 0.14, 0.24);
    g.rotateY(rr2);
    g.translate((e.ax + e.bx) / 2, 0.71 + rh, (e.az + e.bz) / 2);
    rails.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries([...parts, ...rails]), M.stone);
  m.position.set(x, baseY, z);
  m.rotation.y = rot;
  return { group: m, deck: baseY + 0.8 };
}

/* ------------------------------------------------------------------ 院墙 */

/** 台地边缘的一圈黄墙，上覆瓦顶，把院子的边界画出来 */
function courtWall(points, { height = 2.8, baseY, gap = null } = {}) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const y = baseY ?? heightAt(cx, cz);
    if (gap && i === gap) continue;
    const g = bx(len, height, 0.62);
    g.rotateY(rot);
    g.translate(cx, y + height / 2, cz);
    add('temple', g);
    const f = {
      pts: [{ x: x0, y: y + height, z: z0 }, { x: x1, y: y + height, z: z1 }],
      right: [{ x: Math.sin(rot), z: -Math.cos(rot) }, { x: Math.sin(rot), z: -Math.cos(rot) }],
      dist: [0, len],
    };
    add('roof', wallCap(f, { width: 1.15, rise: 0.38, eaveDrop: 0.14 }));
  }
}

/* ------------------------------------------------------------------ 装配 */

/** 一条按地表铺过去的石阶：从一方台地走上另一方，不必知道高差到底几米 */
function stairRun(p0, p1, { steps = 30, width = 4.4 } = {}) {
  const dx = p1[0] - p0[0], dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const x = p0[0] + dx * t, z = p0[2] + dz * t;
    add('paving', put(bx(width, 0.28, Math.max(0.75, (len / steps) * 1.25)), x, heightAt(x, z) - 0.08, z, rot));
  }
  // 两侧的石帮
  for (const s of [-1, 1]) {
    for (let i = 0; i < steps; i += 3) {
      const t = i / (steps - 1);
      const x = p0[0] + dx * t - s * (dz / len) * (width / 2 + 0.3);
      const z = p0[2] + dz * t + s * (dx / len) * (width / 2 + 0.3);
      const y = heightAt(x, z);
      add('stone', put(bx(0.5, 1.1, 1.6), x, y - 0.3, z, rot));
    }
  }
}

/** 台地的挡墙：沿矩形走一圈，哪一段外侧地面高于台面就砌多高 */
function edgeWalls(padKey, { skip = [] } = {}) {
  const p = PADS[padKey];
  const corners = [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]];
  for (let e = 0; e < 4; e++) {
    if (skip.includes(e)) continue;
    const [ax, az] = corners[e], [bx2, bz2] = corners[(e + 1) % 4];
    const len = Math.hypot(bx2 - ax, bz2 - az);
    const n = Math.max(3, Math.round(len / 3.5));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.92) / n;
      const cx = ax + (bx2 - ax) * (t0 + t1) / 2, cz = az + (bz2 - az) * (t0 + t1) / 2;
      // 外侧：往矩形外挪半米看自然地面
      const ox = (bx2 - ax) / len, oz = (bz2 - az) / len;
      const nx = oz, nz = -ox;                       // 外法线
      const outer = heightAt(cx + nx * 2.2, cz + nz * 2.2);
      const rise = outer - p.y;
      if (rise < 0.9) continue;
      const h = Math.min(16, rise + 0.5);
      const g = bx(len / n, h, 0.8);
      g.rotateY(Math.atan2(-oz, ox));
      g.translate(cx, p.y + h / 2 - 0.4, cz);
      add('stone', g);
      const cap = bx(len / n + 0.2, 0.18, 1.1);
      cap.rotateY(Math.atan2(-oz, ox));
      cap.translate(cx, p.y + h - 0.4 + 0.09, cz);
      add('stone', cap);
    }
  }
}

/* ------------------------------------------------------------------ 装配 */

export function buildTemple(scene) {
  const group = new THREE.Group();
  group.name = 'temple';

  const padTower = PADS.tower.y;
  const padHall = PADS.hall.y;
  const padCliff = PADS.cliff.y;

  /* 塔院 */
  const tower = pagoda({ x: TEMPLE.pagoda.x, z: TEMPLE.pagoda.z, baseY: heightAt(TEMPLE.pagoda.x, TEMPLE.pagoda.z) });
  group.add(tower.group);
  edgeWalls('tower');
  courtWall([[PADS.tower.x0 + 1, PADS.tower.z0 + 1], [PADS.tower.x1 - 1, PADS.tower.z0 + 1],
    [PADS.tower.x1 - 1, PADS.tower.z1 - 1], [PADS.tower.x0 + 1, PADS.tower.z1 - 1],
    [PADS.tower.x0 + 1, PADS.tower.z0 + 1]], { height: 2.9, baseY: padTower, gap: 2 });

  /* 殿台：一路殿都按各自的落点取基座高，台上不平也不悬 */
  const yuantong = hall({ ...TEMPLE.yuantong, baseY: heightAt(TEMPLE.yuantong.x, TEMPLE.yuantong.z) });
  hall({ ...TEMPLE.dasheng, baseY: heightAt(TEMPLE.dasheng.x, TEMPLE.dasheng.z) });
  const fr = TEMPLE.faru;
  hall({ ...fr, baseY: heightAt(fr.x, fr.z) });
  hall({ ...TEMPLE.sanxian, baseY: heightAt(TEMPLE.sanxian.x, TEMPLE.sanxian.z) });
  storeyBuilding({ ...TEMPLE.cuijing, baseY: heightAt(TEMPLE.cuijing.x, TEMPLE.cuijing.z), name: '萃景楼' });

  // 十八高僧之壁：6 列 3 行正好十八格，斜光扫过去才显出刻痕
  const panelY = heightAt(fr.x - 11, fr.z);
  const panel = new THREE.Mesh(mergeGeometries([
    bx(12.4, 5.2, 0.55).translate(0, 2.6, 0),
    bx(13.2, 0.42, 1.2).translate(0, 5.45, 0),
    bx(13.8, 0.6, 1.8).translate(0, 0.3, 0),
  ]), M.stele);
  panel.position.set(fr.x - 11, panelY, fr.z);
  panel.rotation.y = HALF_PI;
  group.add(panel);

  edgeWalls('hall');

  /* 山门在殿台与山门台之间，路正好送到门前 */
  const gt = TEMPLE.gate;
  const gate = mountainGate(gt);

  /* 塔院与殿台之间的踏道：两方台地差着一截，这一段全是石阶 */
  stairRun([PADS.hall.x0 + 4, 0, 6], [PADS.tower.x1 - 3, 0, 6], { steps: 44, width: 4.6 });
  // 路头到山门：从台面外侧的坡上落一段下来
  stairRun([101, 0, 32], [gt.x + 4, 0, gt.z + 3], { steps: 20, width: 3.8 });

  /* 西崖：大观台与望江亭 */
  const dx = TEMPLE.daxiang;
  const ter = terrace({ x: dx.x, z: dx.z, baseY: heightAt(dx.x, dx.z), w: dx.w, d: dx.d });
  group.add(ter.group);
  const pv = TEMPLE.pavilion;
  const pav = octagonPavilion({ x: pv.x, z: pv.z, baseY: heightAt(pv.x, pv.z), half: pv.half, name: pv.name });
  group.add(pav.group);
  edgeWalls('cliff');
  // 崖顶到殿台的一条石阶（写意）
  stairRun([PADS.cliff.x1 + 2, 0, 12], [PADS.cliff.x1 - 6, 0, 9], { steps: 12, width: 3.2 });

  /* 临江摩崖 */
  const cw = TEMPLE.cliffWall;
  const inscription = cliffInscription(cw);

  /* 东南麓墓区 */
  const t0 = TOMB;
  const ty = heightAt(t0.x, t0.z);
  const court = new THREE.Mesh(mergeGeometries([
    bx(t0.walls.w, 4.4, t0.walls.d).translate(0, -1.78, 0),
    bx(t0.walls.w + 1.2, 0.22, t0.walls.d + 1.2).translate(0, 0.55, 0),
  ]), M.paving);
  court.position.set(t0.x, ty - 1.4, t0.z);
  court.rotation.y = t0.rot;
  group.add(court);
  const [awx, awz] = at(t0.x, t0.z, t0.rot, t0.archway.dx, t0.archway.dz);
  archway({
    x: awx, y: heightAt(awx, awz) + 0.6, z: awz, rot: t0.rot + HALF_PI,
    name: '唐骆宾王墓',
    record: '唐侍御史谥文忠骆公赠淑人范氏合墓',
  });
  mound({ x: t0.x, y: ty + 0.66, z: t0.z, r: t0.moundR, stele: '唐骆宾王墓', figures: true });
  for (const [dx2, dz2] of t0.companions) {
    mound({ x: t0.x + dx2, y: ty + 0.62, z: t0.z + dz2, r: 1.9 });
  }
  const hw = t0.walls.w / 2, hd = t0.walls.d / 2;
  courtWall([
    [t0.x - hw, t0.z - hd], [t0.x + hw, t0.z - hd], [t0.x + hw, t0.z + hd],
    [t0.x - hw, t0.z + hd], [t0.x - hw, t0.z - hd],
  ], { height: 2.3, baseY: ty + 0.5 });

  /* 合并进材质批次 */
  const built = {};
  for (const key of Object.keys(C)) {
    if (!C[key].length) continue;
    const merged = mergeGeometries(C[key]);
    const m = new THREE.Mesh(merged, M[key] || M.stone);
    m.name = `temple-${key}`;
    group.add(m);
    built[key] = m;
  }
  for (const e of extras) group.add(e);
  extras.length = 0;

  scene.add(group);
  return {
    group, built,
    tower, gate, pav, ter, inscription, yuantong, panel,
    padTower, padHall, padCliff,
    windowSheets,
    eaveLamps: eaves,
  };
}
