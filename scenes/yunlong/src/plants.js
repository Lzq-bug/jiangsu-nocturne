import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, lit, rand, rr, swayed, blobGeometry } from './kit.js';
import * as T from './textures.js';
import { terrainHeight, SITES, LAKE } from './data.js';

/**
 * 山上的树：以松与侧柏为主的暗色体块。夜里树的价值不是叶子，是脊线上的那条
 * 锯口——山头的轮廓全靠它。所以树都往脊线两侧密排，坡脚反而稀。
 */

export const windUniforms = [];

function wind(m, opts) {
  swayed(m, opts);
  if (m.userData.sway) windUniforms.push(m.userData.sway);
  return m;
}

const PINE_H = 6.4;

/** 一棵松：三段压扁的锥加一茎干，合成一个可实例化的几何 */
function pineGeometry() {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.12, 0.2, PINE_H * 0.8, 6, 1, false)
    .translate(0, PINE_H * 0.4, 0));
  for (let k = 0; k < 3; k++) {
    const y = PINE_H * (0.44 + k * 0.19);
    const r = (1.85 - k * 0.5);
    const cone = new THREE.ConeGeometry(r, 1.7, 7, 1, false);
    cone.translate(rr(-0.18, 0.18), y + 0.5, rr(-0.18, 0.18));
    parts.push(cone);
  }
  return mergeGeometries(parts);
}

/** 一丛灌木：一团扁石似的冠 */
function shrubGeometry() {
  return blobGeometry(1.15, { detail: 1, amp: 0.32, squash: 0.5, seed: 9 });
}

export function buildPlants(scene) {
  const group = new THREE.Group();
  group.name = 'plants';

  const pineMat = wind(lit('#2f4433', {
    map: T.canopy(), rough: 0.94, side: THREE.DoubleSide,
    emissive: '#0a1309', ei: 0.34, vertexColors: false,
  }), { amp: 0.032, speed: 0.85, height: PINE_H, base: 0.1, ref: 'pine' });
  const shrubMat = wind(lit('#3a4a34', { map: T.canopy(), rough: 0.95, side: THREE.DoubleSide, emissive: '#0c130b', ei: 0.3 }),
    { amp: 0.05, speed: 1.1, height: 1.2, base: 0.6, ref: 'shrub' });

  // 名物四周不留树：殿前、亭前、龛前、冈上
  const clear = [
    ...Object.values(SITES).map((s) => [s.x, s.z, 15]),
    [LAKE.causeway.xTo - 4, LAKE.causeway.z + 15, 10],
  ];
  const near = (x, z) => clear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

  /* ------------------------------------------------------------ 松 */
  const spots = [];
  let tries = 0;
  while (spots.length < 820 && tries < 26000) {
    tries++;
    const x = -340 + rand() * 780;
    const z = -1460 + rand() * 2860;
    const h = terrainHeight(x, z);
    if (h < 12 || h > 140) continue;
    // 坡太陡的是崖，长不了树
    const dh = Math.abs(terrainHeight(x + 8, z) - h) + Math.abs(terrainHeight(x, z + 8) - h);
    if (dh > 7.5) continue;
    // 越靠近脊线越密
    const crestNear = h / 145;
    if (rand() > 0.24 + 0.76 * crestNear) continue;
    if (near(x, z)) continue;
    spots.push([x, h, z]);
  }

  const pines = new THREE.InstancedMesh(pineGeometry(), pineMat, spots.length);
  pines.name = 'pines';
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach(([x, y, z], i) => {
    const s = rr(0.62, 1.22);
    d.position.set(x, y - 0.2, z);
    d.rotation.set(rr(-0.05, 0.05), rand() * 6.28, rr(-0.05, 0.05));
    d.scale.set(rr(0.82, 1.12), s, rr(0.82, 1.12));
    d.updateMatrix();
    pines.setMatrixAt(i, d.matrix);
    col.setHSL(0.28 + rand() * 0.05, 0.2 + rand() * 0.14, 0.13 + rand() * 0.1);
    pines.setColorAt(i, col);
  });
  pines.instanceMatrix.needsUpdate = true;
  if (pines.instanceColor) pines.instanceColor.needsUpdate = true;
  pines.frustumCulled = false;
  group.add(pines);

  /* ------------------------------------------------------------ 灌木 */
  const shrubs = [];
  tries = 0;
  while (shrubs.length < 260 && tries < 9000) {
    tries++;
    const x = -330 + rand() * 700;
    const z = -1400 + rand() * 2760;
    const h = terrainHeight(x, z);
    if (h < 6 || h > 120) continue;
    if (near(x, z)) continue;
    if (rand() > 0.5) continue;
    shrubs.push([x, h, z]);
  }
  const bushMesh = new THREE.InstancedMesh(shrubGeometry(), shrubMat, shrubs.length);
  bushMesh.name = 'shrubs';
  shrubs.forEach(([x, y, z], i) => {
    const s = rr(0.7, 1.6);
    d.position.set(x, y + s * 0.3, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.5, 0.8), s);
    d.updateMatrix();
    bushMesh.setMatrixAt(i, d.matrix);
    col.setHSL(0.26 + rand() * 0.06, 0.18 + rand() * 0.12, 0.1 + rand() * 0.08);
    bushMesh.setColorAt(i, col);
  });
  bushMesh.instanceMatrix.needsUpdate = true;
  if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
  bushMesh.frustumCulled = false;
  group.add(bushMesh);

  /* -------------------------------------------------- 殿前与亭前的几株老松 */
  const elders = [
    { key: 'temple', dx: -16, dz: 12, h: 1.45 },
    { key: 'temple', dx: 15, dz: 15, h: 1.3 },
    { key: 'pavilion', dx: 9, dz: -7, h: 1.2 },
    { key: 'academy', dx: -11, dz: 9, h: 1.15 },
    { key: 'dashiyan', dx: 8, dz: -9, h: 1.25 },
    { key: 'huangmao', dx: -12, dz: 26, h: 1.1 },
  ];
  for (const e of elders) {
    const base = SITES[e.key] || terrainHeightSite(e.key);
    const x = base.x + e.dx, z = base.z + e.dz;
    const y = terrainHeight(x, z);
    if (y < 4) continue;
    const m = new THREE.InstancedMesh(pineGeometry(), pineMat, 1);
    d.position.set(x, y - 0.3, z);
    d.rotation.set(0, rand() * 6.28, rr(-0.06, 0.06));
    d.scale.set(1.2, e.h * 1.2, 1.2);
    d.updateMatrix();
    m.setMatrixAt(0, d.matrix);
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    m.name = 'elder-pine';
    group.add(m);
  }

  scene.add(group);
  return { group, windUniforms, pineCount: spots.length };
}
