import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundAt, SITE, PLATFORMS, GULLIES, SEA } from './data.js';
import { M, lit, mesh, box, cyl, blobGeometry, rand, rr, swayed, quadGrid } from './kit.js';
import * as T from './textures.js';

/**
 * 山上的树按坡面与高度自己找位置：崖面上不长，顶风的山脊只留几棵歪松，
 * 平野上是村边的杂树与竹。风一过，树冠整片松开来。
 */

const TRUNK = lit('#3a3128', { rough: 0.86, emissive: '#120d07', ei: 0.3 });
const PINY = lit('#33482f', {
  map: T.canopy(), rough: 0.94, side: THREE.DoubleSide, vertexColors: false,
  emissive: '#0d1610', ei: 0.3,
});
const WEEPY = lit('#41563a', {
  map: T.canopy(), rough: 0.95, side: THREE.DoubleSide, emissive: '#0f1a0d', ei: 0.26,
});

function blocked(x, z) {
  for (const p of PLATFORMS) {
    if (Math.hypot((x - p.x) / (p.rx * 1.2), (z - p.z) / (p.rz * 1.2)) < 1) return true;
  }
  for (const g of GULLIES) {
    if (Math.hypot((x - g.x) / (g.len * 0.7), (z - g.z) / (g.halfW * 0.5)) < 1) return true;
  }
  // 建筑本体占的地方不栽树
  const keep = [[SITE.temple.x, SITE.temple.z, 84, 40], [SITE.pagoda.x, SITE.pagoda.z, 40, 40],
    [SITE.cave.x, SITE.cave.z, 60, 50], [SITE.boulders.x, SITE.boulders.z, 40, 34],
    [SITE.southgate.x, SITE.southgate.z, 34, 30], [SITE.bridge.x, SITE.bridge.z, 46, 34],
    [SITE.gate.x, SITE.gate.z, 40, 30]];
  for (const [kx, kz, hw, hh] of keep) {
    if (Math.abs(x - kx) < hw && Math.abs(z - kz) < hh) return true;
  }
  return false;
}

function slope(x, z) {
  const d = 9;
  return Math.hypot(groundAt(x + d, z) - groundAt(x - d, z), groundAt(x, z + d) - groundAt(x, z - d)) / (2 * d);
}

export function buildPlants(scene) {
  const grp = new THREE.Group();
  grp.name = 'plants';
  const trunks = [], crowns = [], softTrunk = [], softCrown = [];
  const windUniforms = [];

  /* ------------------------------------------------------------ 松 */
  let tries = 0, made = 0;
  while (made < 340 && tries < 5200) {
    tries++;
    const x = rr(-660, 460), z = rr(-1180, 1180);
    const y = groundAt(x, z);
    if (y < 18 || y > 590) continue;
    if (slope(x, z) > 0.92) continue;
    if (blocked(x, z)) continue;
    const h = rr(6, 15) * (1 - Math.max(0, (y - 380) / 900));
    const lean = (rand() - 0.5) * 0.16;
    trunks.push(cylRot(0.34, 0.16, h, 6, x, y - 0.4, z, lean));
    const tiers = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const r = (2.4 + rand() * 1.6) * (1 - t * 0.42) * (h / 10);
      const cy = y + h * (0.52 + t * 0.5);
      const g = blobGeometry(Math.max(0.9, r), { detail: 1, amp: 0.26, squash: 0.42, seed: made * 7 + i });
      g.translate(x + lean * cy * 0.2, cy, z);
      crowns.push(g);
    }
    made++;
  }

  /* ------------------------------------------------- 坡下的杂树与竹 */
  for (let i = 0; i < 260; i++) {
    const west = rand() > 0.28;
    const x = west ? rr(-1300, -680) : rr(960, 1170);
    const z = rr(-1150, 1150);
    const y = groundAt(x, z);
    if (y < 3 || y > 24) continue;
    if (Math.abs(SEA.oldShore(z) - x) < 12) continue;
    const h = rr(3.4, 7.2);
    softTrunk.push(cyl(0.2, 0.12, h, 5, x, y, z));
    const g = blobGeometry(rr(1.6, 2.9), { detail: 1, amp: 0.3, squash: 0.66, seed: i + 41 });
    g.translate(x, y + h * 0.92, z);
    softCrown.push(g);
  }

  // 山门与宫前的几丛竹：灯下有影子可摇
  const bamboo = [];
  const bambooLeaf = [];
  for (const [cx, cz, n] of [[SITE.gate.x + 6, SITE.gate.z - 12, 30], [SITE.gate.x + 6, SITE.gate.z + 12, 26],
    [SITE.temple.x + 30, SITE.temple.z - 30, 34], [SITE.temple.x - 20, SITE.temple.z + 30, 28]]) {
    for (let i = 0; i < n; i++) {
      const x = cx + rr(-5, 5), z = cz + rr(-5, 5);
      const y = groundAt(x, z);
      if (y < 5) continue;
      const hh = rr(4.2, 7);
      bamboo.push(cyl(0.11, 0.09, hh, 5, x, y, z));
      const cl = blobGeometry(rr(0.9, 1.7), { detail: 1, amp: 0.4, squash: 0.5, seed: i + 7 });
      cl.translate(x, y + hh * 0.94, z);
      bambooLeaf.push(cl);
    }
  }

  const pineMat = swayed(PINY.clone(), { amp: 0.05, speed: 0.72, height: 12, base: 0.2, ref: 'pine' });
  const softMat = swayed(WEEPY.clone(), { amp: 0.075, speed: 0.95, height: 7, base: 0.3, ref: 'crown' });
  const bambooMat = swayed(lit('#3d5236', {
    rough: 0.78, metal: 0.02, emissive: '#0b1208', ei: 0.34, side: THREE.DoubleSide,
  }), { amp: 0.11, speed: 1.35, height: 6.4, base: 0.34, ref: 'bamboo' });
  grp.add(mesh(trunks, TRUNK));
  grp.add(mesh(softTrunk, TRUNK));
  grp.add(mesh(bamboo, bambooMat));
  grp.add(mesh(bambooLeaf, softMat));
  grp.add(mesh(crowns, pineMat));
  grp.add(mesh(softCrown, softMat));
  for (const m of [pineMat, softMat, bambooMat]) {
    if (m.userData.sway) windUniforms.push(m.userData.sway);
  }
  grp.children.forEach((c) => { if (c.isMesh) c.name = 'crowns'; });

  scene.add(grp);
  return { group: grp, windUniforms, count: made };
}

function cylRot(rB, rT, h, seg, x, y, z, lean) {
  const g = new THREE.CylinderGeometry(rT, rB, h, seg, 1, false);
  g.translate(0, h / 2, 0);
  g.rotateZ(lean);
  g.translate(x, y, z);
  return g;
}
