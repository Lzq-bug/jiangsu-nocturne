import * as THREE from 'three';
import { CANAL, BRIDGE, LANE } from './data.js';
import { M, mesh, box, loft, roundedSection, rand, rr } from './kit.js';

/**
 * 文亨桥, the far bank and the city behind it — the layer that frames the lane.
 * The bridge closes the north end of the vista, old roofs line the far bank, and
 * new towers stand behind them, so one night holds two ages in it.
 *
 * The arches are sized from the water: each ring springs just above the summer
 * waterline and its crown sits 1.5 m under the deck, so the hump of the bridge
 * follows from the arches instead of being painted on.
 */
export function buildSkyline(scene) {
  const g = new THREE.Group();
  g.name = 'skyline';

  const stone = [], dark = [], roofs = [], litPanels = [], wood = [], foliage = [], lampHeads = [];
  const B = (list, w, h, d, x, yBottom, z) => list.push(box(w, h, d, x, yBottom, z));
  const bridgeLamps = [];

  /* ---------------------------------------------------------------- 文亨桥 */
  const z0 = BRIDGE.deckZ[0], z1 = BRIDGE.deckZ[1];
  const mid = (z0 + z1) / 2;
  const spring = BRIDGE.springY;
  const width = BRIDGE.width;
  const crown = BRIDGE.crownY;
  const approachY = CANAL.wallTop + 0.2;

  // 记载：中孔跨径 11.6 米、边孔各 6.1 米，故半径取半跨
  const radii = BRIDGE.arches === 1 ? [BRIDGE.rMid]
    : BRIDGE.arches === 3 ? [BRIDGE.rSide, BRIDGE.rMid, BRIDGE.rSide]
      : Array.from({ length: BRIDGE.arches }, (_, i) => (i === Math.floor(BRIDGE.arches / 2) ? BRIDGE.rMid : BRIDGE.rSide));
  // 沿河展开，再把整组拱心平移到中孔落在桥中心
  const offs = [];
  let cur = 0;
  for (const R of radii) { offs.push(cur + R); cur += 2 * R + BRIDGE.pier; }
  const shift = mid - offs[Math.floor(radii.length / 2)];
  const arches = radii.map((R, i) => ({ z: offs[i] + shift, R }));

  /** 桥面标高：拱顶一段近平，到两头以台阶落下 */
  const reach = (cur - BRIDGE.pier) / 2 + 6;
  const deckY = (z) => {
    const dz = Math.abs(z - mid);
    return Math.max(approachY, crown - (crown - approachY) * Math.pow(Math.min(1, dz / reach), 4.6));
  };
  /** 拱腹下缘：孔内是券面，孔外落到河床 */
  const soffit = (z) => {
    let y = -2.2;
    for (const a of arches) {
      const d = z - a.z;
      if (Math.abs(d) < a.R) y = Math.max(y, spring + Math.sqrt(a.R * a.R - d * d));
    }
    return y;
  };

  for (const a of arches) {
    const ring = new THREE.TorusGeometry(a.R, 0.46, 8, 26, Math.PI);
    ring.rotateY(Math.PI / 2);                 // stand the ring up across the canal
    ring.translate(BRIDGE.x, spring, a.z);
    stone.push(ring);
  }

  // 桥面、券脸填充、栏杆——一段段砌上去，孔洞自然留下
  const N = 68;
  const step = (z1 - z0) / N;
  for (let i = 0; i < N; i++) {
    const z = z0 + (i + 0.5) * step;
    const y = deckY(z), d = step + 0.06;
    const s = soffit(z) + 0.34;
    B(stone, width, 0.44, d, BRIDGE.x, y - 0.44, z);
    if (y - 0.44 > s) B(stone, width * 0.98, y - 0.44 - s, d, BRIDGE.x, s, z);
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const x = BRIDGE.x + side * (width / 2 - 0.34);
        B(stone, 0.3, 0.92, 0.3, x, y, z);
        B(stone, 0.18, 0.16, d * 2, x, y + 0.92, z);
      }
    }
  }
  // 两头 台阶 落到岸上
  for (const dir of [-1, 1]) {
    const zEdge = dir > 0 ? z0 : z1;
    for (let k = 0; k < 6; k++) {
      const y = approachY - k * 0.34;
      B(stone, width, 0.34, 0.9, BRIDGE.x, y - 0.34, zEdge - dir * (k * 0.9 + 0.5));
    }
  }
  // 桥灯
  for (const f of [0.08, 0.32, 0.5, 0.68, 0.92]) {
    const z = z0 + f * (z1 - z0);
    const y = deckY(z);
    for (const side of [-1, 1]) {
      const x = BRIDGE.x + side * (width / 2 - 0.34);
      B(stone, 0.22, 1.35, 0.22, x, y, z);
      const head = new THREE.SphereGeometry(0.3, 10, 8);
      head.scale(1, 1.22, 1);
      head.translate(x, y + 1.75, z);
      lampHeads.push(head);
      bridgeLamps.push([x, y + 1.75, z]);
    }
  }

  /* ---------------------------------------------------------------- 对岸 老屋 */
  const frontZ = CANAL.farZ + 8;
  for (let x = -300; x < 420; x += rr(7, 12)) {
    const w = rr(6.5, 11), d = rr(6, 10), h = rr(4.4, 7.4);
    B(dark, w, h, d, x, CANAL.wallTop + 0.2, frontZ + d / 2);
    B(roofs, w + 1, 0.28, d + 1, x, CANAL.wallTop + 0.2 + h, frontZ + d / 2);
    if (rand() > 0.52) {
      const p = new THREE.PlaneGeometry(1.1, 1.0);
      p.rotateY(Math.PI);
      p.translate(x + rr(-w / 3, w / 3), CANAL.wallTop + 2.5, frontZ - 0.06);
      litPanels.push(p);
    }
  }

  /* ---------------------------------------------------------------- 新城 高层 */
  const towers = [];
  for (let i = 0; i < 24; i++) {
    const w = rr(14, 26), d = rr(12, 22), h = rr(24, 48);
    const x = -320 + i * 31 + rr(-8, 8);
    const zz = 96 + rr(0, 74);
    towers.push(loft([
      { y: 0, cx: x, cz: zz, sx: w / 2, sz: d / 2 },
      { y: h * 0.8, cx: x, cz: zz, sx: w / 2, sz: d / 2 },
      { y: h, cx: x, cz: zz, sx: (w / 2) * rr(0.6, 0.95), sz: (d / 2) * rr(0.6, 0.95) },
    ], roundedSection(0.16, 3), { uvScale: 1 }));
    B(dark, 2, 2, 2, x, h, zz);
  }

  /* ---------------------------------------------------------------- 树 */
  function willow(x, z, s = 1) {
    const tr = new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 3.4 * s, 7);
    tr.translate(x, CANAL.quayTopY + 1.7 * s, z);
    wood.push(tr);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.SphereGeometry(1.5 * s * rr(0.7, 1.15), 8, 6);
      c.scale(1, 0.62, 1);
      c.translate(x + rr(-1.5, 1.5) * s, CANAL.quayTopY + 3.4 * s + rr(-0.3, 0.8), z + rr(-1.5, 1.5) * s);
      foliage.push(c);
    }
  }
  for (let x = -250; x < 380; x += 37) willow(x, CANAL.nearZ - 5.5, rr(0.8, 1.15));
  for (let x = -240; x < 400; x += 44) {
    const s = rr(0.8, 1.1);
    const tr = new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 3 * s, 6);
    tr.translate(x, CANAL.wallTop + 1.5 * s, CANAL.farZ + 5);
    wood.push(tr);
    const c = new THREE.SphereGeometry(1.4 * s, 7, 5);
    c.scale(1, 0.66, 1);
    c.translate(x, CANAL.wallTop + 3.2 * s, CANAL.farZ + 5);
    foliage.push(c);
  }

  /* ---------------------------------------------------------------- 两端的老屋 */
  // 东头续街
  for (let i = 0; i < 9; i++) {
    const x = LANE.xMin - 10 - i * 9;
    const h = rr(4.6, 7.6);
    const zz = -13 + rr(-7, 7);
    B(dark, 8.4, h, 15, x, CANAL.laneY - 0.4, zz);
    B(roofs, 9.4, 0.28, 16, x, CANAL.laneY - 0.4 + h, zz);
  }
  // 西头只补到桥那头，码头与阁前的空地留给这两处地标
  for (let i = 0; i < 5; i++) {
    const x = BRIDGE.x + 44 + i * 10;
    const h = rr(4.6, 7.2);
    const zz = -12 + rr(-6, 6);
    B(dark, 8.4, h, 14, x, CANAL.laneY - 0.4, zz);
    B(roofs, 9.4, 0.28, 15, x, CANAL.laneY - 0.4 + h, zz);
  }

  /* ---------------------------------------------------------------- assembly */
  const put = (geos, mat, name) => {
    if (!geos.length) return;
    const m = mesh(geos, mat);
    if (name) m.name = name;
    g.add(m);
  };
  put(stone, M.stone);
  put(dark, M.silhouette);
  put(wood, M.woodDark);
  put(foliage, M.foliage);
  put(roofs, M.tile);
  put(lampHeads, M.lantern);
  put(litPanels, M.lattice);

  const cityGroup = new THREE.Group();
  cityGroup.name = 'city';
  for (const geo of towers) cityGroup.add(new THREE.Mesh(geo, rand() > 0.5 ? M.cityCool : M.city));
  g.add(cityGroup);

  scene.add(g);
  return { group: g, city: cityGroup, bridgeLamps, deckY };
}
