import * as THREE from 'three';
import { STREET, GATE_PAIFANG, BANNER_WORDS, PLAQUE_WORDS } from './data.js';
import { M, PAL, box, mesh, quad, rand, rr, pick, glow } from './kit.js';
import { layout } from './street.js';
import * as T from './textures.js';

const eave = (k) => STREET.deck + STREET.floorH * k;

/* -------------------------------------------------------------------- 檐灯 */

function buildLanterns(scene, out) {
  const { frontZ, half } = STREET;
  const buckets = [
    { list: [], geo: squashed(0.4), size: 3.2 },
    { list: [], geo: squashed(0.28), size: 2.2 },
  ];
  for (const s of layout().segs) {
    const n = Math.max(1, Math.floor((s.x1 - s.x0) / s.lampGap));
    for (let i = 0; i < n; i++) {
      const x = s.x0 + (i + 0.5) * ((s.x1 - s.x0) / n);
      const y = eave(1) - 0.66 - rr(0, 0.2);
      const z = s.side * (frontZ - 0.85);
      buckets[i % 3 === 0 ? 0 : 1].list.push({ x, y, z });
    }
  }
  const matBody = glow(PAL.lantern, 1.7);
  const meshes = [];
  for (const b of buckets) {
    const im = new THREE.InstancedMesh(b.geo, matBody, b.list.length);
    const d = new THREE.Object3D();
    b.list.forEach((l, i) => {
      d.position.set(l.x, l.y, l.z);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      out.cord.push(box(0.05, eave(1) - 0.2 - l.y, 0.05, l.x, l.y + 0.16, l.z));
      out.haloAt.push([l.x, l.y, l.z, b.size]);
      out.poolAt.push([l.x, Math.sign(l.z) * (half - 1.5)]);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.name = 'lanterns';
    scene.add(im);
    meshes.push(im);
  }
  return { meshes, matBody, base: matBody.color.clone() };
}

function squashed(r) {
  const g = new THREE.SphereGeometry(r, 12, 9);
  g.scale(1, 0.8, 1);
  return g;
}

/* -------------------------------------------------------------------- 幌子 */

function atlasUV(atlas, index) {
  const col = index % atlas.cols, row = Math.floor(index / atlas.cols);
  const v0 = 1 - row / atlas.rows, v1 = 1 - (row + 1) / atlas.rows;
  return [[col / atlas.cols, v1], [(col + 1) / atlas.cols, v1], [(col + 1) / atlas.cols, v0], [col / atlas.cols, v0]];
}

function buildSigns(scene) {
  const banner = T.bannerAtlas(BANNER_WORDS, { cols: 4 });
  const plaque = T.plaqueAtlas(PLAQUE_WORDS, { cols: 3 });
  const sheet = (atlas) => {
    const m = new THREE.MeshBasicMaterial({ map: atlas.texture, transparent: true, side: THREE.DoubleSide });
    m.toneMapped = false;
    return m;
  };
  const bannerMat = sheet(banner), plaqueMat = sheet(plaque);
  const banners = [], plaques = [];
  for (const s of layout().segs) {
    if (s.banner) {
      const x = s.x0 + rr(1.2, Math.max(1.4, s.x1 - s.x0 - 1.2));
      const z = s.side * (STREET.frontZ - 0.62);
      const y1 = eave(1) - 0.3, y0 = y1 - rr(2.0, 2.6);
      banners.push(quad([[x - 0.3, y0, z], [x + 0.3, y0, z], [x + 0.3, y1, z], [x - 0.3, y1, z]],
        { uv: atlasUV(banner, (rand() * banner.count) | 0), dir: [0, 0, -s.side] }));
    }
    if (rand() < 0.55) {
      const cx = s.x0 + (s.x1 - s.x0) * rr(0.3, 0.7);
      const z = s.side * (STREET.frontZ - 0.34);
      const y = eave(1) - 1.2;
      plaques.push(quad([[cx - 0.75, y, z], [cx + 0.75, y, z], [cx + 0.75, y + 0.52, z], [cx - 0.75, y + 0.52, z]],
        { uv: atlasUV(plaque, (rand() * plaque.count) | 0), dir: [0, 0, -s.side] }));
    }
  }
  const grp = new THREE.Group();
  grp.name = 'signs';
  grp.add(mesh(banners, bannerMat));
  grp.add(mesh(plaques, plaqueMat));
  scene.add(grp);
  return grp;
}

/* -------------------------------------------------------------------- 人流 */

function buildCrowd(scene) {
  const MAX = 200;
  const geo = mesh([
    box(0.3, 0.78, 0.18, 0, 0.46, 0),
    box(0.36, 0.62, 0.2, 0, 1.02, 0),
    new THREE.SphereGeometry(0.11, 8, 6).translate(0, 1.74, 0),
  ], M.silhouette).geometry;
  const im = new THREE.InstancedMesh(geo, M.silhouette, MAX);
  im.frustumCulled = false;
  im.name = 'crowd';
  scene.add(im);

  // 人只在有铺面的那一段走，西口外不留人，免得贴着相机站成一个黑柱子
  const START = 26;
  const span = STREET.x1 - START - 6;
  const people = [];
  for (let i = 0; i < MAX; i++) {
    people.push({
      x: rr(0, span),
      z: rr(-(STREET.half - 1.5), STREET.half - 1.5),
      v: rr(0.45, 1.15) * (rand() < 0.5 ? -1 : 1),
      phase: rand() * 6.28,
      scale: rr(0.92, 1.08),
    });
  }
  const d = new THREE.Object3D();
  let active = MAX;
  return {
    mesh: im,
    setDensity(k) { active = Math.round(MAX * Math.min(1, Math.max(0, k))); },
    update(t) {
      for (let i = 0; i < active; i++) {
        const p = people[i];
        const x = ((p.x + p.v * t) % span + span) % span + START;
        d.position.set(x, STREET.deck + 0.1, p.z + Math.sin(t * 1.7 + p.phase) * 0.16);
        d.rotation.set(0, p.v > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(t * 3.4 + p.phase) * 0.02);
        d.scale.setScalar(p.scale);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.count = active;
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------------------------------------------------------------- 街边杂物 */

function buildStalls(scene) {
  const parts = { wood: [], dark: [], stone: [] };
  for (const x of [26, 44, 71, 96, 128, 158, 203, 232, 268, 296, 318]) {
    const z = pick([-1, 1]) * (STREET.half - 1.7);
    if (rand() < 0.5) {
      // 货摊：一张板、四只脚、一领席棚
      parts.wood.push(box(2.2, 0.1, 1.1, x, 0.86, z));
      for (const dx of [-0.9, 0.9]) for (const dz of [-0.42, 0.42]) parts.wood.push(box(0.1, 0.86, 0.1, x + dx, 0.5, z + dz));
      parts.wood.push(box(2.6, 0.08, 1.5, x, 1.98, z));
      for (const dx of [-1.15, 1.15]) parts.wood.push(box(0.08, 1.12, 0.08, x + dx, 0.9, z - 0.6));
      parts.dark.push(box(0.6, 0.22, 0.42, x - 0.4, 0.96, z));
      parts.dark.push(box(0.34, 0.3, 0.34, x + 0.5, 1.0, z + 0.1));
    } else {
      // 门前石缸与木架
      parts.stone.push(new THREE.CylinderGeometry(0.46, 0.36, 0.62, 12, 1).translate(x, 0.82, z));
      parts.wood.push(box(1.0, 0.08, 0.5, x + 1.4, 1.24, z));
      for (const dx of [0.98, 1.88]) parts.wood.push(box(0.08, 0.72, 0.08, x + dx, 0.52, z));
    }
  }
  const grp = new THREE.Group();
  grp.name = 'stalls';
  grp.add(mesh(parts.wood, M.wood));
  grp.add(mesh(parts.dark, M.woodDark));
  if (parts.stone.length) grp.add(mesh(parts.stone, M.curb));
  scene.add(grp);
  return grp;
}

/** 园墙后探出的竹：夜里只读得出竿与叶影 */
function buildBamboo(scene, region) {
  if (!region) return null;
  const canes = [], leaves = [];
  for (let i = 0; i < 44; i++) {
    const x = rr(region.x0, region.x1);
    const z = rr(region.z0, region.z1);
    const h = rr(5.2, 8.6);
    canes.push(new THREE.CylinderGeometry(0.055, 0.08, h, 5, 1).translate(x, 0.5 + h / 2, z));
    for (let k = 0; k < 3; k++) {
      const ly = 0.5 + h * rr(0.62, 1.0);
      const w = rr(0.6, 1.5);
      const a = rand() * Math.PI;
      const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
      leaves.push(quad([[x - dx, ly, z - dz], [x, ly + 0.16, z], [x + dx, ly, z + dz], [x, ly - 0.1, z]], { dir: [0, 1, 0] }));
    }
  }
  const grp = new THREE.Group();
  grp.name = 'bamboo';
  grp.add(mesh(canes, M.bamboo));
  grp.add(mesh(leaves, M.leaf));
  scene.add(grp);
  return grp;
}

/** 街口的四盏石灯：西口机位的前景得有光落下来 */
function buildMouthLamps(scene, halo) {
  const posts = [], poolsAt = [];
  for (const [x, z] of [[-14, -5.4], [-14, 5.4], [-2, -5.8], [-2, 5.8]]) {
    posts.push(box(0.34, 2.2, 0.34, x, STREET.deck, z));
    posts.push(box(0.66, 0.22, 0.66, x, STREET.deck + 2.2, z));
    posts.push(box(0.5, 0.46, 0.5, x, STREET.deck + 2.42, z));
    halo.add(x, STREET.deck + 2.66, z, '#ffc27e', 2.6);
    poolsAt.push([x, z * 0.8]);
  }
  scene.add(mesh(posts, M.curb));
  const L = new THREE.PointLight(new THREE.Color('#ffb469'), 26, 26, 2);
  L.position.set(-8, STREET.deck + 2.6, 0);
  scene.add(L);
  return { light: L, poolsAt };
}

/* -------------------------------------------------------------------- 组装 */

/**
 * halo / pools 由 main 建一次、街与渡口共写，一次 draw call 装下整条灯河。
 */
export function buildProps(scene, street, { halo, pools }) {
  const out = { cord: [], poolAt: [], haloAt: [] };
  const lamp = buildLanterns(scene, out);
  buildSigns(scene);
  const crowd = buildCrowd(scene);
  buildStalls(scene);
  if (street.anchors.bamboo) buildBamboo(scene, street.anchors.bamboo);

  for (const [x, y, z, size] of out.haloAt) halo.add(x, y, z, PAL.lantern, size);
  for (const [x, z] of out.poolAt) pools.add(x, z, '#ff9a4a', 3.4);

  // 每盏灯都打光太贵：沿街留十来盏近光，石板与门面才真的被灯照亮
  const stride = Math.max(1, Math.ceil(out.haloAt.length / 8));
  const lights = [];
  for (let i = 0; i < out.haloAt.length; i += stride) {
    const [x, y, z] = out.haloAt[i];
    const L = new THREE.PointLight(new THREE.Color('#ff9d4e'), 18, 24, 2);
    L.position.set(x, y - 0.2, z * 0.86);
    scene.add(L);
    lights.push(L);
  }
  for (const [x, y, z, k] of [[GATE_PAIFANG, 5.4, 0, 1.4], [STREET.x0 + 8, 3.4, 0, 0.9]]) {
    const L = new THREE.PointLight(new THREE.Color('#ffb469'), 18 * k, 28, 2);
    L.position.set(x, y, z);
    scene.add(L);
    lights.push(L);
  }
  const mouth = buildMouthLamps(scene, halo);
  for (const [x, z] of mouth.poolsAt) pools.add(x, z, '#ff9a4a', 2.4);
  lights.push(mouth.light);

  // 两座牌楼各挂一排灯，西口与渡口才不会是黑的
  for (const pf of street.anchors.paifang) {
    for (const z of [-pf.half + 0.7, -1.7, 1.7, pf.half - 0.7]) {
      halo.add(pf.x, pf.y - 0.6, z, '#ffb469', 2.4);
      pools.add(pf.x, z * 0.7, '#ff9a4a', 2.2);
    }
    const L = new THREE.PointLight(new THREE.Color('#ffb469'), 55, 60, 2);
    L.position.set(pf.x, pf.y - 0.8, 0);
    scene.add(L);
    lights.push(L);
  }
  // 檐口一线小灯：鸟瞰时这条街要读成一根灯河
  for (const s of layout().segs) {
    const n = Math.max(2, Math.round((s.x1 - s.x0) / 2.4));
    for (let i = 0; i < n; i++) {
      const x = s.x0 + (i + 0.5) * ((s.x1 - s.x0) / n);
      halo.add(x, eave(1) - 0.16, s.side * (STREET.frontZ - 0.5), PAL.paper, 1.1);
    }
  }
  for (const q of street.anchors.quanmen) halo.add(q.x, q.y, q.z, '#ffbd7a', 2.0);
  // 巷底各留一盏：夜里巷子比街面暗两级，但不能是全黑的死胡同
  for (const a of STREET.alleys) {
    for (const side of [-1, 1]) {
      const z = side * (STREET.frontZ + a.lane * 0.82);
      halo.add(a.x, 2.9, z, '#e8a267', 2.2);
      pools.add(a.x, z * 0.9, '#c96f33', 1.6);
    }
  }
  const laneLight = new THREE.PointLight(new THREE.Color('#ff9a52'), 14, 20, 2);
  laneLight.position.set(252, 2.9, STREET.frontZ + 22);
  scene.add(laneLight);
  lights.push(laneLight);
  const tp = street.anchors.temple;
  if (tp) {
    halo.add(tp.front.x, tp.front.y, tp.front.z, '#ffbd7a', 2.6);
    halo.add(tp.front.x - 2.4, tp.front.y - 0.6, tp.front.z - 0.2, '#ffbd7a', 1.8);
    halo.add(tp.front.x + 2.4, tp.front.y - 0.6, tp.front.z - 0.2, '#ffbd7a', 1.8);
    const tl = new THREE.PointLight(new THREE.Color('#ffb072'), 24, 26, 2);
    tl.position.set(tp.front.x, tp.front.y + 0.4, tp.front.z + 2.2);
    scene.add(tl);
    lights.push(tl);
  }
  const gg = street.anchors.gardenGate;
  if (gg) halo.add(gg.x, gg.y, gg.z, '#f7b073', 2.0);

  // 所有会随灯彩滑杆变化的灯都登记完了，这里取基准亮度
  const lightBase = lights.map((l) => l.intensity);

  scene.add(mesh(out.cord, M.woodDark));

  const shopBase = M.shop.emissiveIntensity;
  return {
    crowd,
    setLantern(k) {
      const g = 0.18 + 0.82 * k;
      halo.setGain(g);
      pools.setGain(0.12 + 0.34 * k);
      lamp.matBody.color.copy(lamp.base).multiplyScalar(0.5 + 0.7 * k);
      lights.forEach((L, i) => { L.intensity = lightBase[i] * (0.15 + 1.1 * k); });
    },
    setShopLit(k) { M.shop.emissiveIntensity = shopBase * (0.12 + 1.2 * k); },
    setCrowd(k) { crowd.setDensity(k); },
    update(t) { crowd.update(t); },
  };
}
