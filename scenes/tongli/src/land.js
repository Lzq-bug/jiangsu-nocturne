import * as THREE from 'three';
import { mergeAll, mesh, lit, rand, rr, nanCheck } from './kit.js';
import * as T from './textures.js';
import { ISLANDS, LAKES, BANKS, BANK, QUAY_DRAFT, DEP, PLAIN_Y, pointIn, GARDEN } from './data.js';

/**
 * 陆地：七块地浮在同一片水上，块与块的缝就是镇河。
 * 于是"水多"不是画在地图上的河道纹理，而是几何上的空隙——机位往下一看是河，
 * 河对岸是另一块地的墙与窗，这才是水乡。
 *
 * 每一块地同一个做法：
 *   1. 条石驳岸自水下 2.6 米垒到岸顶 2.2 米，越靠水越深、越潮越暗；
 *   2. 岸顶压一道向外探的花岗岩边，压住水陆接缝；
 *   3. 贴边一条沿河街（向内 4.2 米），民居就靠这条街摆（见 houses.js）；
 *   4. 每隔二三十米下一道河埠头：三级石级到水、旁立一块系船石。
 *
 * 镇外是把整片水"挖"出来的地坪：外圈一个大方块、洞是湖界，
 * 于是湖岸线自然成立，圩岸再在湖上垒出几条堤，一片水就分成了几片。
 */

const STONE = lit('#6d7680', { map: T.paving({ meters: 1.6, base: '#606a74' }), rough: 0.93 });
const QUAY = lit('#5b646d', { map: T.limestone({ meters: 2.2, base: '#4d565f' }), rough: 0.96, side: THREE.DoubleSide });
const COBBLE = lit('#79828a', { map: T.paving({ meters: 1.15, base: '#6b747c' }), rough: 0.95 });
const GRANITE = lit('#8a9298', { map: T.paving({ meters: 1.4, base: '#7d858b' }), rough: 0.86 });
const EARTH = lit('#2f3a34', { map: T.paving({ meters: 3.4, base: '#28322d' }), rough: 0.97 });

/* ------------------------------------------------------------------ 多边形工具 */

/** 沿闭合多边形按步长取样：位置、切向、内法向、累计弧长 */
export function perimeterFrames(poly, step = 2.6) {
  const n = poly.length;
  const out = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-4) continue;
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let nx = -tz, nz = tx;
    if (!pointIn(poly, a[0] + nx, a[1] + nz)) { nx = tz; nz = -tx; }
    const k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({
        x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t,
        tx, tz, nx, nz, s: total + L * t,
      });
    }
    total += L;
  }
  out.total = total;
  return out;
}

/** 弧长 s 处的那个取样点 */
export function frameAt(frames, s) {
  const total = frames.total || 1;
  const t = ((s % total) + total) % total;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].s <= t) lo = mid; else hi = mid - 1;
  }
  return frames[lo];
}

/** 多边形向内缩 d 米（顶点平均法向 + 尖角补偿；圆角多边形上够用） */
export function offsetPoly(poly, d) {
  const n = poly.length;
  const isInside = (nx, nz, q) => pointIn(poly, q[0] + nx, q[1] + nz);
  return poly.map((q, i) => {
    const p = poly[(i - 1 + n) % n], r = poly[(i + 1) % n];
    const e1 = [q[0] - p[0], q[1] - p[1]], e2 = [r[0] - q[0], r[1] - q[1]];
    const L1 = Math.hypot(...e1) || 1, L2 = Math.hypot(...e2) || 1;
    let nx = -(e1[1] / L1 + e2[1] / L2) / 2, nz = (e1[0] / L1 + e2[0] / L2) / 2;
    const L = Math.hypot(nx, nz) || 1;
    nx /= L; nz /= L;
    if (!isInside(nx, nz, q)) { nx = -nx; nz = -nz; }
    const cos = Math.abs((nx * e2[0] + nz * e2[1]) / L2);
    const k = d / Math.max(0.45, cos);
    return [q[0] + nx * k, q[1] + nz * k];
  });
}

export function polyToShape(poly) {
  const s = new THREE.Shape();
  s.moveTo(poly[0][0], -poly[0][1]);
  for (let i = 1; i < poly.length; i++) s.lineTo(poly[i][0], -poly[i][1]);
  s.closePath();
  return s;
}

/** 两圈等长多边形之间的一片水平面 */
function strip(outer, inner, y, uvScale, drop = 0.03) {
  const n = Math.min(outer.length, inner.length);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    pos.push(outer[i][0], y, outer[i][1]);
    uv.push(outer[i][0] / uvScale, outer[i][1] / uvScale);
  }
  for (let i = 0; i < n; i++) {
    pos.push(inner[i][0], y - drop, inner[i][1]);
    uv.push(inner[i][0] / uvScale, inner[i][1] / uvScale);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, n + i, j, j, n + i, n + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  nanCheck(g, COBBLE);
  return g;
}

/* ------------------------------------------------------------------ 驳岸与埠头 */

/** 一圈竖壁：rows 是由低到高的 [{y, dry}]，dry=0 处最深最暗 */
function quayWall(frames, rows) {
  const pos = [], uv = [], idx = [], col = [];
  const w = frames.length;
  for (const r of rows) {
    for (const f of frames) {
      const bulge = 0.15 * Math.sin(f.s * 0.29) + 0.05 * Math.sin(f.s * 1.13 + 2.1);
      const x = f.x - f.nx * bulge, z = f.z - f.nz * bulge;
      pos.push(x, r.y, z);
      uv.push(f.s / 2.2, (r.y + QUAY_DRAFT) / 2.2);
      const k = r.dry;
      col.push(0.30 + 0.62 * k, 0.33 + 0.58 * k, 0.36 + 0.55 * k);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < w; i++) {
      const j = (i + 1) % w;
      const a = r * w + i, b = r * w + j, c = (r + 1) * w + i, d = (r + 1) * w + j;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  nanCheck(g, QUAY);
  return g;
}

/** 埠头：三级石级下水，一块系船石立在侧 */
function wharf(f, { width = 2.3 } = {}) {
  const rot = Math.atan2(-f.tz, f.tx);
  const parts = [];
  const put = (w, h, d, out, y) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(rot);
    g.translate(f.x - f.nx * out, y, f.z - f.nz * out);
    parts.push(g);
  };
  // 岸顶平台 → 三级 → 最下一级泡在水里
  put(width + 1.2, 0.34, 1.7, 1.5, BANK - 0.32);
  put(width, 0.5, 0.78, 2.3, BANK - 0.78);
  put(width, 0.5, 0.78, 3.0, BANK - 1.35);
  put(width, 0.5, 0.78, 3.7, BANK - 1.95);
  put(width, 0.5, 0.78, 4.4, BANK - 2.5);
  // 系船石：一根矮石柱立在阶侧
  const p = new THREE.CylinderGeometry(0.22, 0.26, 0.82, 7);
  p.rotateY(rot);
  p.translate(f.x - f.nx * 1.5 + f.tx * (width / 2 + 0.55), BANK - 0.25, f.z - f.nz * 1.5 + f.tz * (width / 2 + 0.55));
  parts.push(p);
  return parts;
}

/* ------------------------------------------------------------------ 圩岸 */

/** 一条圩岸：顶在 DEP，两侧土坡落水；桥上与堤上有灯位 */
function bankSolid(b) {
  const parts = [];
  for (let i = 0; i < b.path.length - 1; i++) {
    const [ax, az] = b.path[i], [bx, bz] = b.path[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(-(bz - az), bx - ax);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const body = new THREE.BoxGeometry(L + 4, DEP + 2.6, b.width);
    body.rotateY(rot);
    body.translate(cx, (DEP + 2.6) / 2 - 2.4, cz);
    parts.push(body);
    // 顶面两侧各一条略高的塘路肩
    for (const sgn of [-1, 1]) {
      const off = new THREE.Vector3(0, 0, sgn * (b.width / 2 - 0.9))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      const shoulder = new THREE.BoxGeometry(L + 4, 0.34, 1.9);
      shoulder.rotateY(rot);
      shoulder.translate(cx + off.x, DEP + 0.12, cz + off.z);
      parts.push(shoulder);
    }
  }
  return mergeAll(parts);
}

/* ------------------------------------------------------------------ 主入口 */

export function buildLand(scene) {
  const g = new THREE.Group();
  g.name = 'land';

  const quayParts = [], capParts = [], topParts = [], streetParts = [], wharfParts = [];
  const lampPosts = [];   // 岸灯/街灯落位 [x, z, 外法向x, 外法向z]
  const wharves = [];     // 埠头 {x,z,dir,width}

  for (const isl of ISLANDS) {
    const poly = isl.poly;
    const frames = perimeterFrames(poly, 2.6);

    quayParts.push(quayWall(frames, [
      { y: BANK - QUAY_DRAFT, dry: 0 },
      { y: BANK - QUAY_DRAFT * 0.42, dry: 0.26 },
      { y: BANK - 0.8, dry: 0.62 },
      { y: BANK + 0.03, dry: 1 },
    ]));

    // 压顶：向外探出，压住水陆的缝
    const inner = offsetPoly(poly, -0.1);
    const outer = poly.map((p, i) => [
      p[0] + (p[0] - inner[i][0]) * 5.0, p[1] + (p[1] - inner[i][1]) * 5.0,
    ]);
    capParts.push(strip(outer, inner, BANK + 0.16, 1.4, 0.24));

    // 园池的洞要在地块上挖开，否则水面压在石板之下
    const topShape = polyToShape(poly);
    if (isl.id === 'n1') topShape.holes.push(polyToShape(GARDEN.pondPoly));
    const top = new THREE.ShapeGeometry(topShape, 6);
    top.rotateX(-Math.PI / 2);
    top.translate(0, BANK + 0.04, 0);
    topParts.push(top);

    streetParts.push(strip(poly, offsetPoly(poly, 4.2), BANK + 0.12, 1.15));

    /* ---- 埠头与岸灯 */
    for (let s = 8 + rand() * 6; s < frames.total; s += rr(27, 46)) {
      const f = frameAt(frames, s);
      const width = rr(1.9, 2.9);
      wharfParts.push(...wharf(f, { width }));
      wharves.push({ x: f.x - f.nx * 2.4, z: f.z - f.nz * 2.4, dir: Math.atan2(-f.tz, f.tx), width });
    }
    for (let s = 11; s < frames.total; s += 11.5) {
      const f = frameAt(frames, s);
      if (wharves.some((w) => Math.hypot(w.x - f.x, w.z - f.z) < 4.4)) continue;
      lampPosts.push([f.x - f.nx * 1.0, f.z - f.nz * 1.0, -f.nx, -f.nz]);
    }
  }

  /* ---- 圩岸 */
  const banks = BANKS.map(bankSolid);
  const bm = mesh(mergeAll(banks), EARTH);
  bm.name = 'banks';
  bm.receiveShadow = true;
  g.add(bm);
  for (const b of BANKS) {
    for (let i = 0; i < b.path.length - 1; i++) {
      const [ax, az] = b.path[i], [bx, bz] = b.path[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / 26));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        lampPosts.push([ax + (bx - ax) * t, az + (bz - az) * t, tz, -tx]);
      }
    }
  }

  /* ---- 镇外地坪：一个大块，洞是湖界 */
  const plainShape = new THREE.Shape();
  plainShape.moveTo(-1760, 1620);
  plainShape.lineTo(1760, 1620);
  plainShape.lineTo(1760, -1820);
  plainShape.lineTo(-1760, -1820);
  plainShape.closePath();
  plainShape.holes.push(polyToShape(LAKES.extent));
  const plainG = new THREE.ExtrudeGeometry(plainShape, { depth: 5.4, bevelEnabled: false, curveSegments: 10, steps: 1 });
  plainG.rotateX(-Math.PI / 2);
  plainG.translate(0, PLAIN_Y - 5.4, 0);
  const plain = new THREE.Mesh(plainG, EARTH);
  plain.name = 'outer-plain';
  plain.receiveShadow = true;
  g.add(plain);

  /* ---- 合并 */
  const quayM = mesh(mergeAll(quayParts), QUAY);
  quayM.receiveShadow = true;
  quayM.name = 'quay';
  g.add(quayM);

  const capM = mesh(mergeAll(capParts), GRANITE);
  capM.name = 'quay-cap';
  g.add(capM);

  const topM = mesh(mergeAll(topParts), STONE);
  topM.receiveShadow = true;
  topM.name = 'island-top';
  g.add(topM);

  const streetM = mesh(mergeAll(streetParts), COBBLE);
  streetM.receiveShadow = true;
  streetM.name = 'streets';
  g.add(streetM);

  const wharfM = mesh(mergeAll(wharfParts), GRANITE);
  wharfM.name = 'wharves';
  wharfM.receiveShadow = true;
  g.add(wharfM);

  scene.add(g);
  return {
    group: g, wharves, lampPosts,
    materials: { STONE, QUAY, COBBLE, GRANITE, EARTH },
  };
}
