import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, mesh, lit, rand, rr, quadGrid, blobGeometry, roundedSection, loft,
  registerOccluder, clamp01,
} from './kit.js';
import * as T from './textures.js';
import { terrainHeight, FEATURES, site, crestAt, LAKE } from './data.js';

/**
 * 山体：一只朝西开口的环。
 * 一张解析高度场铺出主脊与两支（grid 用非线性映射，核心处密、两头疏），
 * 陡度由法线读出来写进顶点色——缓坡显土、崖面显石。
 * 黄茅冈的乱石、摩崖龛像与题记壁都从同一张高度场里长出来，所以山挪一尺，石跟着挪一尺。
 */

/** 网格范围与核心加密：x = X0 + p·AX(1+BX p²)，z 同理 */
const X0 = -60, AX = 262, BX = 0.55;
const Z0 = -110, AZ = 1000, BZ = 0.34;
const NU = 128, NV = 296;

const mapX = (p) => X0 + p * AX * (1 + BX * p * p);
const mapZ = (q) => Z0 + q * AZ * (1 + BZ * q * q);

export function buildHill(scene) {
  const group = new THREE.Group();
  group.name = 'hill';

  /* ------------------------------------------------------------ 山体 */
  const geo = quadGrid((u, v) => {
    const x = mapX(u * 2 - 1);
    const z = mapZ(v * 2 - 1);
    return [x, terrainHeight(x, z), z];
  }, NU, NV, { spanU: (mapX(1) - mapX(-1)), spanV: (mapZ(1) - mapZ(-1)) });

  // 陡度用网格自己的法线读，省掉每点四次高度场差分
  geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const nor = geo.attributes.normal;
  const pos = geo.attributes.position;
  const VEG = new THREE.Color('#4a5a41');
  const ROCK = new THREE.Color('#8d979d');
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const ny = nor.getY(i);
    const steep = clamp01((0.965 - ny) / 0.2);
    const y = pos.getY(i);
    const top = clamp01((y - 20) / 120);
    c.copy(VEG).lerp(ROCK, Math.min(1, steep * 1.25));
    // 高处风蚀得白一点，低处受城内灯气的暖
    c.multiplyScalar(0.9 + 0.34 * top);
    const x = pos.getX(i), z = pos.getZ(i);
    const east = nor.getX(i);                    // 法线的东分量：朝东的坡吃到城灯
    c.r += 0.06 * Math.max(0, east) * (1 - top);
    c.g += 0.03 * Math.max(0, east) * (1 - top);
    c.b += 0.01 * Math.max(0, east);
    // 湖那面的坡脚一线水气
    if (x < -180 && y < 26) { c.g += 0.02; c.b += 0.03; }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7d8a83'),
    map: T.limestone({ meters: 18 }),
    roughness: 0.96, metalness: 0.02, vertexColors: true,
    emissive: new THREE.Color('#0c1218'), emissiveIntensity: 0.55,
  });
  const body = new THREE.Mesh(geo, mat);
  body.name = 'mountain';
  body.receiveShadow = true;
  group.add(body);

  /* ------------------------------------------------- 山脚的暗色收边 */
  // 高度场在山脚摊成 0，与地坪之间留一圈裙边，免得网格边缘露出锋利的折痕
  const skirt = [];
  for (const [x, z] of shorePoints()) {
    const y = terrainHeight(x, z);
    if (y > 6) continue;
    skirt.push(new THREE.CircleGeometry(rr(14, 26), 9).rotateX(-Math.PI / 2).translate(x, y + 0.05, z));
  }
  if (skirt.length) group.add(mesh(mergeGeometries(skirt), M.mossGround));

  /* ---------------------------------------------------- 黄茅冈乱石 */
  const rocks = buildHuangmao();
  group.add(rocks.group);

  /* ------------------------------------------------------ 摩崖龛像 */
  const niches = buildNiches();
  group.add(niches.group);

  /* ---------------------------------------------------- 崖面题记 */
  const panels = buildCliffPanels();
  group.add(panels);

  scene.add(group);

  return {
    group,
    rocks: rocks.group,
    rockList: rocks.list,
    nicheAnchors: niches.anchors,
    setNicheRamp: niches.setRamp,
    nicheUpdate: niches.update,
    /** 主脊上第 i 节的中点（山脊灯用） */
    crest: (i) => crestAt(0, (i + 0.5) / 9),
    heightAt: terrainHeight,
  };
}

function shorePoints() {
  const out = [];
  for (const [x, z] of LAKE.shore) {
    for (let k = -1; k <= 1; k++) out.push([x + 12 + k * 16, z + k * 22]);
  }
  return out;
}

/* ------------------------------------------------------------------ 乱石 */

/**
 * "满冈乱石如群羊"：冈上散石，长轴顺着南北，块径 0.8–3.4 米。
 * 石头都坐在 terrainHeight 上，再往下压一点，免得浮起来。
 */
function buildHuangmao() {
  const grp = new THREE.Group();
  grp.name = 'huangmao-rocks';
  const H = site(FEATURES.huangmao);
  const list = [];
  const parts = [];
  // 冈是一条南北走向的脊：沿主脊切向铺开
  const along = { x: H.ux, z: H.uz };
  const across = { x: H.nx, z: H.nz };
  for (let i = 0; i < 240; i++) {
    const s = rr(-145, 145);                       // 沿冈
    const t = rr(-52, 52);                         // 横冈
    const x = H.x + along.x * s + across.x * t;
    const z = H.z + along.z * s + across.z * t;
    const y = terrainHeight(x, z);
    if (y < 8 || y > 74) continue;
    const r = rr(0.5, 2.3) * (1 - Math.abs(t) / 150);
    if (r < 0.25) continue;
    const g = blobGeometry(Math.max(0.4, r), {
      detail: 2, amp: 0.3, squash: rr(0.44, 0.72), seed: i * 7.3,
    });
    g.rotateY(rand() * 3.2);
    g.translate(x, y - r * 0.22, z);
    parts.push(g);
    list.push({ x, y, z, r });
  }
  const m = mesh(mergeGeometries(parts), M.rockHill);
  m.receiveShadow = true;
  m.name = 'huangmao-field';
  grp.add(m);

  /* 东坡石床：长 3.3、宽 1.3、高 1.75 米（可考尺寸），顶面磨平 */
  const B = site(FEATURES.bed);
  const bedY = terrainHeight(B.x, B.z);
  const bedParts = [];
  const lvl = [
    { y: bedY - 0.5, cx: B.x, cz: B.z, sx: 2.1, sz: 1.05 },
    { y: bedY + 0.5, cx: B.x, cz: B.z, sx: 1.78, sz: 0.72 },
    { y: bedY + 1.42, cx: B.x, cz: B.z, sx: 1.66, sz: 0.65 },
    { y: bedY + 1.75, cx: B.x, cz: B.z, sx: 1.65, sz: 0.64 },   // 磨平的顶
  ];
  const sect = roundedSection(0.34, 3);
  bedParts.push(loft(lvl, sect, { uvScale: 2.2 }));
  const bed = mesh(bedParts, M.rockPolished);
  bed.name = 'dongpo-bed';
  grp.add(bed);
  registerOccluder(bed, 3.4, new THREE.Vector3(B.x, bedY + 1, B.z));

  // 顶面那层磨光：一块略亮的薄片，月光下起一条硬边
  const polish = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.24).rotateX(-Math.PI / 2),
    lit('#9aa2a4', { map: T.limestone({ meters: 1.6 }), rough: 0.52, metal: 0.06 }),
  );
  polish.position.set(B.x, bedY + 1.752, B.z);
  grp.add(polish);

  /* "黄茅冈"题刻壁：石壁长 3 米、高 1 米，单字约 80×50 厘米 */
  const G = site(FEATURES.gangWall);
  const gy = terrainHeight(G.x, G.z);
  const wall = new THREE.Group();
  const slab = mesh([
    new THREE.BoxGeometry(3.0, 1.0, 0.5).translate(0, 0.5, 0),
    new THREE.BoxGeometry(3.4, 0.22, 0.8).translate(0, 0.02, 0),
  ], M.rockPlain);
  wall.add(slab);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 0.86), M.carved);
  face.position.set(0, 0.56, 0.26);
  wall.add(face);
  const name = T.calligraphy('黄茅冈', {
    vertical: false, cols: 1, w: 1024, h: 300, ink: '#dfe6e6', size: 0.82,
  });
  const letters = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.76),
    new THREE.MeshBasicMaterial({ map: name, transparent: true, color: new THREE.Color('#8f9a9c') }),
  );
  letters.material.toneMapped = false;
  letters.position.set(0, 0.56, 0.268);
  wall.add(letters);
  wall.position.set(G.x, gy - 0.1, G.z);
  wall.rotation.y = Math.atan2(-G.gx, -G.gz) + Math.PI;   // 面朝下坡
  grp.add(wall);

  return { group: grp, list };
}

/* -------------------------------------------------------------- 摩崖龛像 */

/**
 * 七组、共 71 龛（可考数目）。每龛一座拱顶浅穴加一尊坐像剪影，
 * 外加一盏只在自己龛前亮的小光斑——斜光扫过去时按顺序点起来。
 */
function buildNiches() {
  const grp = new THREE.Group();
  grp.name = 'niches';
  const N = site(FEATURES.niches);
  const baseY = terrainHeight(N.x, N.z);
  const down = { x: -N.gx, z: -N.gz };
  const L = Math.hypot(down.x, down.z) || 1;
  down.x /= L; down.z /= L;
  const across = { x: -down.z, z: down.x };        // 沿等高线

  const COUNTS = [9, 10, 11, 10, 9, 12, 10];       // 合计 71
  const anchors = [];
  const shells = [], figures = [], glows = [];
  let order = 0;
  const total = COUNTS.reduce((a, b) => a + b, 0);

  for (let g = 0; g < COUNTS.length; g++) {
    const gTop = 11.5 - g * 1.5;                   // 各组的高程带：上组最高
    const gLen = COUNTS[g];
    const spread = 3.2 + gLen * 1.15;
    const jitter = rr(-6, 6);
    for (let i = 0; i < gLen; i++) {
      const along = -spread / 2 + (i + 0.5) * (spread / gLen) + jitter;
      const rise = gTop + rr(-0.5, 0.5) + (i % 2 ? 0.35 : -0.2);
      const x = N.x + across.x * along + down.x * rr(1.2, 3.4);
      const z = N.z + across.z * along + down.z * rr(1.2, 3.4);
      const wall = terrainHeight(x, z);
      const y = Math.max(wall - 1.2, baseY - 24) + rise;
      const yaw = Math.atan2(-down.x, -down.z);
      const s = rr(0.62, 1.05);
      shells.push({ x, y, z, yaw, s });
      figures.push({ x: x + down.x * 0.24, y: y - 0.16, z: z + down.z * 0.24, yaw, s: s * 0.5 });
      glows.push({ x: x + down.x * 0.5, y: y - 0.05, z: z + down.z * 0.5, yaw, s: s * 0.72, t: order / total });
      anchors.push([x + down.x * 0.8, y, z + down.z * 0.8]);
      order++;
    }
  }

  const shellGeo = new THREE.PlaneGeometry(1.15, 1.35);
  const shellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a3138'), map: T.nicheFace(), emissiveMap: T.nicheFace(),
    emissive: new THREE.Color('#121820'), emissiveIntensity: 0.5, roughness: 0.9,
  });
  const sm = new THREE.InstancedMesh(shellGeo, shellMat, shells.length);
  sm.name = 'niche-shells';
  const figGeo = mergeGeometries([
    new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.34, 0),
    new THREE.CylinderGeometry(0.1, 0.26, 0.36, 8).translate(0, 0.12, 0),
  ]);
  const fm = new THREE.InstancedMesh(figGeo, lit('#96a09f', { rough: 0.92 }), figures.length);
  fm.name = 'niche-figures';
  const glowGeo = new THREE.PlaneGeometry(1.5, 1.7);
  const glowMat = new THREE.MeshBasicMaterial({
    map: T.softGlow('255,206,150', 0.16), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  glowMat.toneMapped = false;
  const gm = new THREE.InstancedMesh(glowGeo, glowMat, glows.length);
  gm.name = 'niche-glows';
  gm.frustumCulled = false;
  gm.renderOrder = 6;

  const d = new THREE.Object3D();
  const put = (im, list, kScale = 1) => {
    list.forEach((p, i) => {
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, p.yaw, 0);
      const s = p.s * kScale;
      d.scale.set(s, s, s);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  put(sm, shells);
  put(fm, figures);
  put(gm, glows);
  grp.add(sm, fm, gm);

  /* 一道横扫的斜光：一条贴着崖面的亮带，扫到哪里哪里起 */
  const rake = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 7),
    new THREE.MeshBasicMaterial({
      map: T.softGlow('255,222,180', 0.02), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }),
  );
  rake.material.toneMapped = false;
  rake.name = 'niche-rake';
  rake.position.set(N.x + down.x * 4.2, baseY - 6, N.z + down.z * 4.2);
  rake.rotation.y = Math.atan2(-down.x, -down.z);
  grp.add(rake);

  let ramp = 0;
  const setRamp = (v) => {
    ramp = v;
    gm.material.opacity = 0.78 * Math.min(1.2, Math.max(0, v));
    rake.position.y = baseY + 10 - v * 26;
    rake.material.opacity = v > 0.02 ? 0.34 : 0.06;
  };
  setRamp(0.55);

  return {
    group: grp, anchors,
    setRamp,
    update(t) {
      // 龛前的光各自有点呼吸，扫过去之后不是一片死亮
      gm.material.opacity = 0.55 * Math.min(1.2, ramp) * (0.86 + 0.14 * Math.sin(t * 0.9));
    },
  };
}

/* ------------------------------------------------------------ 崖面题记 */

/**
 * 山西与环内各贴一块磨平的崖面，用作唐至清的题记带。
 * 面板跟着高度场走：四角落在坡面上，再朝上坡推出去，免得挡在建筑与机位前面。
 * 寺与大士岩各有自己的崖（在 buildings.js 里），这里不再叠一块。
 */
function buildCliffPanels() {
  const grp = new THREE.Group();
  grp.name = 'cliff-panels';
  const spots = [
    { key: 'cliffBand', w: 26, h: 13 },
    { key: 'academy', w: 15, h: 8 },
  ];
  const panels = [];
  for (const s of spots) {
    const P = site(FEATURES[s.key]);
    const gx = P.gx, gz = P.gz;
    const L = Math.hypot(gx, gz) || 1;
    const dx = -gx / L, dz = -gz / L;              // 下坡方向
    const along = { x: -dz, z: dx };
    const y0 = terrainHeight(P.x, P.z);
    const g = new THREE.PlaneGeometry(s.w, s.h, 8, 4);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const lx = a.getX(i), ly = a.getY(i);
      const px = P.x + along.x * lx + dx * 1.4;
      const pz = P.z + along.z * lx + dz * 1.4;
      const ground = terrainHeight(px, pz);
      a.setXYZ(i, lx, Math.max(ly, ground - (y0 - s.h * 0.42) + 1.2), 0);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.carved);
    m.name = `panel-${s.key}`;
    const yaw = Math.atan2(-dx, -dz);
    m.rotation.y = yaw;
    m.position.set(P.x, y0 + s.h * 0.42, P.z);
    m.receiveShadow = true;
    panels.push(m);
    grp.add(m);
  }

  /* "洞天"摩崖：清乾隆年间杨四知题，在西壁 */
  const D = site(FEATURES.dashiyan);
  const dy = terrainHeight(D.x, D.z);
  const tab = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.0),
    new THREE.MeshBasicMaterial({
      map: T.calligraphy('洞天', { vertical: true, cols: 1, w: 260, h: 350, ink: '#e2e9ea', size: 0.86 }),
      transparent: true, color: new THREE.Color('#96a0a2'),
    }),
  );
  tab.material.toneMapped = false;
  tab.position.set(D.x + 1.7, dy + 2.6, D.z + 1.4);
  tab.rotation.y = Math.atan2(-(-D.gx), -(-D.gz));
  grp.add(tab);

  return grp;
}
