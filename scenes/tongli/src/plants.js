import * as THREE from 'three';
import { mergeAll, lit, rand, rr, swayed, blobGeometry, quadGrid } from './kit.js';
import * as T from './textures.js';
import { ISLANDS, BANKS, RESERVE, inReserve, GARDEN, ISLET, BRIDGES, DEP, BANK } from './data.js';
import { perimeterFrames, frameAt } from './land.js';

/**
 * 树。水乡的树几乎全长在两条线上：一条是河街（柳与香樟隔着十几米一株），
 * 一条是圩岸与湖岸（杂木与竹）。镇子的内部是屋顶，没有树的余地——
 * 所以这一景的绿只出现在缝边上，从鸟瞰看就是一圈毛边。
 *
 * 品种按江南水乡常见者给：香樟、梧桐、柳、竹、桂。形制写意，不对应哪一株古树。
 */

export const windUniforms = [];

function wind(m, opts) {
  swayed(m, opts);
  if (m.userData.sway) windUniforms.push(m.userData.sway);
  return m;
}

const CAMPHOR = wind(lit('#2f4a33', {
  map: T.canopy(), rough: 0.95, side: THREE.DoubleSide, emissive: '#0a140b', ei: 0.32,
}), { amp: 0.05, speed: 0.72, height: 9, base: 0.35, ref: 'camphor' });
const WILLOW = wind(lit('#3d5741', {
  map: T.canopy(), rough: 0.94, side: THREE.DoubleSide, emissive: '#0c160d', ei: 0.34,
}), { amp: 0.09, speed: 1.05, height: 6, base: 0.5, ref: 'willow' });
const PAULA = wind(lit('#3a5236', {
  map: T.canopy(), rough: 0.94, side: THREE.DoubleSide, emissive: '#0d170c', ei: 0.32,
}), { amp: 0.06, speed: 0.9, height: 11, base: 0.3, ref: 'paulownia' });
const BAMBOO = wind(lit('#5f7a52', {
  map: T.bambooLeaf(), rough: 0.8, side: THREE.DoubleSide, alphaTest: 0.34, emissive: '#101a0c', ei: 0.3,
}), { amp: 0.12, speed: 1.3, height: 5.6, base: 0.7, ref: 'bamboo' });
const BARK = lit('#2b2a24', { map: T.noise(), rough: 0.95 });
const SHRUB = wind(lit('#37472f', { map: T.canopy(), rough: 0.96, side: THREE.DoubleSide, emissive: '#0b120a', ei: 0.3 }),
  { amp: 0.04, speed: 1.15, height: 1.2, base: 0.6, ref: 'shrub' });

/* ------------------------------------------------------------------ 单株几何 */

function camphorGeo() {
  const h = rr(7.5, 12);
  const parts = [new THREE.CylinderGeometry(0.22, 0.4, h * 0.55, 6).translate(0, h * 0.27, 0)];
  for (let k = 0; k < 4; k++) {
    const r = rr(2.1, 3.4);
    const g = blobGeometry(r, { detail: 1, amp: 0.3, squash: 0.62, seed: k + (h | 0) });
    g.translate(rr(-2.1, 2.1), h * rr(0.6, 0.92), rr(-2.1, 2.1));
    parts.push(g);
  }
  return mergeAll(parts);
}

/** 柳：一株一干，垂下几帘细枝——夜里读得出"垂"就够了 */
function willowGeo() {
  const h = rr(5, 7.2);
  const parts = [
    new THREE.CylinderGeometry(0.16, 0.34, h, 6).translate(0, h / 2, 0),
    new THREE.CylinderGeometry(0.1, 0.16, 1.5, 5).rotateZ(rr(-0.5, 0.5)).translate(rr(-0.8, 0.8), h * 0.94, rr(-0.6, 0.6)),
  ];
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.4;
    const r0 = rr(1.2, 2.1), drop0 = rr(2.4, 3.6);
    parts.push(quadGrid((u, v) => {
      const rr2 = r0 * (1 - 0.12 * v);
      const sag = drop0 * v * v;
      return [
        Math.cos(a) * rr2 + Math.sin(a) * 0.1 * u,
        h * 0.92 - sag,
        Math.sin(a) * rr2 - Math.cos(a) * 0.1 * u,
      ];
    }, 2, 5, { spanU: 0.5, spanV: drop0 }));
  }
  const crown = blobGeometry(rr(1.5, 2.1), { detail: 1, amp: 0.34, squash: 0.6, seed: (h * 3) | 0 });
  crown.translate(0, h * 0.95, 0);
  parts.push(crown);
  return mergeAll(parts);
}

/** 梧桐：一根高干，冠顶在很高的地方摊开 */
function paulowniaGeo() {
  const h = rr(9.5, 13);
  const parts = [new THREE.CylinderGeometry(0.2, 0.42, h * 0.72, 7).translate(0, h * 0.36, 0)];
  for (let k = 0; k < 3; k++) {
    for (const sgn of [-1, 1]) {
      parts.push(new THREE.CylinderGeometry(0.09, 0.15, 2.1, 5)
        .rotateZ(sgn * rr(0.6, 0.95))
        .translate(sgn * 0.9, h * rr(0.62, 0.74), rr(-0.7, 0.7)));
    }
  }
  const g = blobGeometry(rr(2.9, 3.9), { detail: 2, amp: 0.24, squash: 0.55, seed: (h * 5) | 0 });
  g.translate(0, h * 0.85, 0);
  parts.push(g);
  return mergeAll(parts);
}

/** 竹丛：几根秆加一团叶 */
function bambooGeo() {
  const parts = [];
  const n = 7 + ((rand() * 5) | 0);
  for (let k = 0; k < n; k++) {
    const h = rr(4.2, 6.4);
    parts.push(new THREE.CylinderGeometry(0.05, 0.07, h, 5)
      .translate(rr(-1.1, 1.1), h / 2, rr(-1.1, 1.1)));
  }
  for (let k = 0; k < 3; k++) {
    const g = blobGeometry(rr(0.9, 1.5), { detail: 1, amp: 0.4, squash: 0.5, seed: k * 3 + n });
    g.translate(rr(-1, 1), rr(4.2, 5.8), rr(-1, 1));
    parts.push(g);
  }
  return mergeAll(parts);
}

function shrubGeo() {
  return blobGeometry(rr(0.8, 1.4), { detail: 1, amp: 0.34, squash: 0.55, seed: (rand() * 40) | 0 });
}

/* ------------------------------------------------------------------ 种植 */

const nearBridge = (x, z, r = 7) => BRIDGES.some((b) => Math.hypot(b.at[0] - x, b.at[1] - z) < r);
const nearWharf = (list, x, z, r = 6) => list.some((w) => Math.hypot((w.x ?? w[0]) - x, (w.z ?? w[1]) - z) < r);

function scatter(spots, geo, mat, { scale = [0.8, 1.25], yLift = 0.1, name } = {}) {
  if (!spots.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, spots.length);
  m.name = name;
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach(([x, y, z], i) => {
    const s = rr(scale[0], scale[1]);
    d.position.set(x, y - yLift, z);
    d.rotation.set(rr(-0.03, 0.03), rand() * 6.28, rr(-0.03, 0.03));
    d.scale.set(s * rr(0.88, 1.1), s, s * rr(0.88, 1.1));
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    col.setHSL(0.25 + rand() * 0.07, 0.16 + rand() * 0.13, 0.1 + rand() * 0.09);
    m.setColorAt(i, col);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;
  return m;
}

export function buildPlants(scene, { wharves = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'plants';

  const willows = [], camphors = [], paulownias = [], bamboos = [], shrubs = [];

  /* ---- 河街一线：柳树贴水，香樟在街口 */
  for (const isl of ISLANDS) {
    const frames = perimeterFrames(isl.poly, 2.6);
    for (let s = 6; s < frames.total; s += rr(12, 19)) {
      const f = frameAt(frames, s);
      const x = f.x - f.nx * 1.5, z = f.z - f.nz * 1.5;
      if (inReserve(x, z, 2)) continue;
      if (nearBridge(x, z, 6) || nearWharf(wharves, x, z, 5)) continue;
      const k = (s / 13) | 0;
      if (k % 3 === 0) camphors.push([x, BANK + 0.05, z]);
      else if (k % 3 === 1) willows.push([x, BANK + 0.05, z]);
      else paulownias.push([x, BANK + 0.05, z]);
    }
    // 内街补几丛竹与绿篱
    const inner = perimeterFrames(isl.poly, 2.6);
    for (let s = 3; s < inner.total; s += rr(21, 34)) {
      const f = frameAt(inner, s);
      const x = f.x - f.nx * 8.5, z = f.z - f.nz * 8.5;
      if (inReserve(x, z, 1)) continue;
      if (rand() > 0.55) shrubs.push([x, BANK, z]);
    }
  }

  /* ---- 退思园里：梧桐、桂、竹是主角 */
  const gp = GARDEN.plot;
  paulownias.push([gp.x0 + 12, BANK + 0.05, gp.z1 - 10], [gp.x1 - 14, BANK + 0.05, gp.z0 + 12]);
  camphors.push([gp.x0 + 8, BANK + 0.05, gp.z0 + 14]);
  bamboos.push([gp.x1 - 9, BANK + 0.05, gp.z1 - 16], [gp.x0 + 20, BANK + 0.05, gp.z1 - 6]);
  shrubs.push([GARDEN.pavilion.x + 3, BANK + 0.05, GARDEN.pavilion.z - 3]);

  /* ---- 名宅的天井与门前 */
  for (const r of RESERVE) {
    if (r.id === 'tuisi') continue;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (r.id === 'chen') {
      paulownias.push([cx - 7, BANK + 0.05, cz + 6], [cx + 6, BANK + 0.05, cz - 7]);
    } else {
      shrubs.push([cx - 6, BANK, cz + 5], [cx + 6, BANK, cz - 5]);
      camphors.push([cx + (rand() > 0.5 ? 9 : -9), BANK + 0.05, cz + 9]);
    }
  }

  /* ---- 圩岸与湖岸 */
  for (const b of BANKS) {
    const frames = perimeterFrames(closedBand(b.path, b.width), 3);
    for (let s = 4; s < frames.total; s += rr(10, 17)) {
      const f = frameAt(frames, s);
      const x = f.x + f.nx * (b.width * 0.1), z = f.z + f.nz * (b.width * 0.1);
      const k = rand();
      if (k > 0.72) camphors.push([x, DEP + 0.05, z]);
      else if (k > 0.42) willows.push([x, DEP + 0.05, z]);
      else if (k > 0.2) paulownias.push([x, DEP + 0.05, z]);
      else bamboos.push([x, DEP + 0.05, z]);
    }
  }

  /* ---- 罗星洲：洲上一片竹与几株樟 */
  for (let k = 0; k < 16; k++) {
    const a = rand() * Math.PI * 2, r0 = rr(10, ISLET.r * 0.86);
    const x = ISLET.x + Math.cos(a) * r0, z = ISLET.z + Math.sin(a) * r0;
    if (Math.hypot(x - (ISLET.wharf.x), z - (ISLET.wharf.z)) < 12) continue;
    (rand() > 0.5 ? bamboos : camphors).push([x, ISLET.y + 0.05, z]);
  }

  const made = [
    scatter(willows, willowGeo(), WILLOW, { name: 'willows', scale: [0.8, 1.2] }),
    scatter(camphors, camphorGeo(), CAMPHOR, { name: 'camphors', scale: [0.72, 1.15] }),
    scatter(paulownias, paulowniaGeo(), PAULA, { name: 'paulownias', scale: [0.8, 1.2] }),
    scatter(bamboos, bambooGeo(), BAMBOO, { name: 'bamboo', scale: [0.75, 1.2], yLift: 0.05 }),
    scatter(shrubs, shrubGeo(), SHRUB, { name: 'shrubs', scale: [0.6, 1.3], yLift: -0.2 }),
  ].filter(Boolean);
  for (const m of made) group.add(m);

  // 树干另一次 draw：所有实例共用一棵几何，颜色靠实例色
  scene.add(group);
  return {
    group, windUniforms, meshes: made,
    counts: { willows: willows.length, camphors: camphors.length, paulownias: paulownias.length, bamboos: bamboos.length, shrubs: shrubs.length },
  };
}

/** 把一条折线撑成一个可以走一圈的闭合多边形 */
function closedBand(path, width) {
  const n = path.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[i], c = path[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], tz = c[1] - a[1];
    const L = Math.hypot(tx, tz) || 1;
    tx /= L; tz /= L;
    left.push([b[0] + tz * width / 2, b[1] - tx * width / 2]);
    right.push([b[0] - tz * width / 2, b[1] + tx * width / 2]);
  }
  return left.concat(right.reverse());
}
