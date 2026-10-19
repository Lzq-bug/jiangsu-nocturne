import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, lit, rand, rr, cyl, blobGeometry, swayed } from './kit.js';
import * as T from './textures.js';
import { terrainHeight, southBank, PLAIN, TOP, TOP_Y, SITES } from './data.js';

/**
 * 山上的树与崖下的草。
 * 北固山今天是一片城里的绿化山，松柏与杂木混植；志书上没有"哪种树是哪年种的"这类账，
 * 所以树的品种与位置一律按观感写意，只有一条守着：崖面上不长成排的树，
 * 免得从江上看过来，那座"三面悬崖"的势被树挡光。
 */

export function buildPlants(scene) {
  const group = new THREE.Group();
  group.name = 'plants';
  const windUniforms = [];

  /* ------------------------------------------------------------ 坡上松柏 */
  const trunks = [], crowns = [];
  let placed = 0;
  let guard = 0;
  while (placed < 320 && guard < 4200) {
    guard++;
    const x = rr(-760, 900), z = rr(-60, 1180);
    const y = terrainHeight(x, z);
    if (y < PLAIN + 2.5 || y > TOP_Y + 1) continue;
    // 陡崖上只留零星几株
    const d = 7;
    const st = Math.hypot(
      (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d),
      (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d),
    );
    if (st > 0.52 && rand() > 0.16) continue;
    // 顶平台留给寺观
    if (Math.hypot(x - TOP.x, z - TOP.z) < 96 && rand() > 0.12) continue;
    const h = rr(4.2, 11.5);
    const r = h * rr(0.2, 0.3);
    trunks.push(cyl(0.16 + h * 0.014, 0.1, h * 0.72, 6, x, y - 0.2, z));
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const cy = y + h * (0.36 + t * 0.56);
      const cr = r * (1.15 - t * 0.5);
      crowns.push(new THREE.SphereGeometry(1, 8, 6).scale(cr, cr * 0.62, cr).translate(x + rr(-0.5, 0.5), cy, z + rr(-0.5, 0.5)));
    }
    placed++;
  }
  if (trunks.length) {
    group.add(mesh(mergeGeometries(trunks), M.bark));
    const crownMat = lit('#2f4534', {
      map: T.pineBough(), rough: 0.94, side: THREE.DoubleSide, alphaTest: 0.34,
      emissive: '#0a1409', ei: 0.26,
    });
    swayed(crownMat, { amp: 0.055, speed: 0.9, height: 9, base: 0.2, ref: 'beigu-pine' });
    windUniforms.push(crownMat.userData.sway);
    const cm = mesh(mergeGeometries(crowns), crownMat);
    cm.name = 'pine-crowns';
    cm.castShadow = false;
    group.add(cm);
  }

  /* ------------------------------------------------------------ 平台边杂木 */
  const bushes = [];
  for (let i = 0; i < 130; i++) {
    const a = rand() * Math.PI * 2;
    const r = rr(84, 132);
    const x = TOP.x + Math.cos(a) * r, z = TOP.z + Math.sin(a) * r * 0.86;
    const y = terrainHeight(x, z);
    if (y < PLAIN + 1) continue;
    const s = rr(0.9, 2.1);
    bushes.push(blobGeometry(s, { detail: 1, amp: 0.3, squash: 0.72, seed: i * 5.1 }).translate(x, y + s * 0.4, z));
  }
  if (bushes.length) {
    const m = mesh(mergeGeometries(bushes), M.foliage);
    m.name = 'top-bushes';
    group.add(m);
  }

  /* ------------------------------------------------------------ 江滩芦苇 */
  const reeds = [];
  for (let i = 0; i < 220; i++) {
    const x = rr(-1500, 1500);
    const b = southBank(x);
    const z = b + rr(2, 46);
    const y = terrainHeight(x, z);
    if (y > PLAIN + 1.6 || y < -0.4) continue;
    const h = rr(1.3, 2.6);
    reeds.push(cyl(0.02, 0.05, h, 4, x, y, z));
  }
  if (reeds.length) {
    const reedMat = lit('#4d5b45', {
      map: T.pineBough(), rough: 0.92, side: THREE.DoubleSide,
      emissive: '#0d1409', ei: 0.22,
    });
    swayed(reedMat, { amp: 0.14, speed: 1.7, height: 2.4, base: 0.4, ref: 'beigu-reed' });
    windUniforms.push(reedMat.userData.sway);
    const rm = mesh(mergeGeometries(reeds), reedMat);
    rm.name = 'reeds';
    group.add(rm);
  }

  scene.add(group);
  return { group, windUniforms, treeCount: trunks.length };
}

/** 山门与古道两侧的四株大松（机位要绕开它们，位置在这里给出去） */
export function gatePines() {
  const S = SITES.gate;
  return [
    [S.x - 13, S.z + 4], [S.x + 13, S.z + 4], [S.x - 9, S.z - 26], [S.x + 9, S.z - 26],
  ].map(([x, z]) => ({ x, y: terrainHeight(x, z), z }));
}
