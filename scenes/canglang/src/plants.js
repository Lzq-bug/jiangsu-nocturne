import * as THREE from 'three';
import { M, mesh, lit, rand, rr, swayed, glow, blobGeometry } from './kit.js';
import * as T from './textures.js';
import { GARDEN, GROUND } from './data.js';

/**
 * 竹、古木、残荷. The grove matters more than any other planting here: 苏舜钦
 * named the garden's bamboo before its stones, and 翠玲珑 is a room with竹 outside
 * all three of its windows.
 */

export const windUniforms = [];

/** register a swayed material so the 竹影摇动 slider can reach it */
function wind(m, opts) {
  swayed(m, opts);
  if (m.userData.sway) windUniforms.push(m.userData.sway);
  return m;
}

/* ------------------------------------------------------------------ 竹 */

const CULM_H = 5.2;

function culmGeometry() {
  // base-anchored so the sway shader can read height as a local coordinate
  const g = new THREE.CylinderGeometry(0.026, 0.046, CULM_H, 6, 3, false);
  g.translate(0, CULM_H / 2, 0);
  return g;
}

function leafClusterGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(0.66, 0.66);
    p.rotateY((i * Math.PI) / 3 + rr(-0.2, 0.2));
    p.rotateX(rr(-0.34, 0.1));
    parts.push(p);
  }
  return mergeSimple(parts);
}

function mergeSimple(parts) {
  const pos = [], nor = [], uv = [], idx = [];
  let o = 0;
  for (const p of parts) {
    const a = p.attributes.position, n = p.attributes.normal, u = p.attributes.uv;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = p.index;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + o);
    o += a.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * A grove: culms placed on a jittered grid inside an irregular outline, each
 * carrying two or three leaf clusters near its head.
 */
function bambooGrove({ x, z, rx, rz, count, y = GROUND, density = 1, avoid = [] }) {
  const culmMat = wind(M.bamboo.clone(), { amp: 0.055, speed: 1.05, height: CULM_H, base: 0.05, ref: `culm-${x}-${z}` });
  const leafMat = wind(M.leaf.clone(), { amp: 0.19, speed: 1.25, height: 1, base: 1.15, ref: `leaf-${x}-${z}` });

  const culms = new THREE.InstancedMesh(culmGeometry(), culmMat, count);
  const leaves = new THREE.InstancedMesh(leafClusterGeometry(), leafMat, count * 5);
  culms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 5 * 3).fill(1), 3);
  const d = new THREE.Object3D();
  const c = new THREE.Color();

  let li = 0;
  for (let i = 0; i < count; i++) {
    // reject sampling inside an ellipse keeps the edge natural, and the 建筑 foot
    // is cut out so the grove does not grow through a floor
    let px, pz, tries = 0, clash = true;
    do {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
      px = x + Math.cos(a) * r * rx;
      pz = z + Math.sin(a) * r * rz;
      clash = avoid.some(([x0, z0, x1, z1]) => px > x0 && px < x1 && pz > z0 && pz < z1);
      tries++;
    } while (tries < 10 && (clash || rand() > density));
    if (clash) {
      // still crowded: park the instance at zero scale rather than branch the counts
      d.position.set(px, -50, pz);
      d.scale.set(0, 0, 0);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      culms.setMatrixAt(i, d.matrix);
      continue;
    }
    const s = rr(0.62, 1.16);
    d.position.set(px, y - 0.15, pz);
    d.rotation.set(rr(-0.045, 0.045), rand() * 3.2, rr(-0.045, 0.045));
    d.scale.set(rr(0.85, 1.1), s, 1);
    d.updateMatrix();
    culms.setMatrixAt(i, d.matrix);
    c.setHSL(0.26 + rand() * 0.06, 0.22 + rand() * 0.16, 0.4 + rand() * 0.16);
    culms.setColorAt(i, c);

    const top = CULM_H * s;
    // 竹 leaves run in whorls along the upper half, not in a tuft on the crown
    for (let k = 0; k < 5; k++) {
      if (li >= leaves.count) break;
      const hy = top * rr(0.48, 1.04);
      const spread = 0.22 + (hy / top) * 0.55;
      d.position.set(px + rr(-spread, spread), y - 0.15 + hy, pz + rr(-spread, spread));
      d.rotation.set(rr(-0.3, 0.2), rand() * 3.2, rr(-0.25, 0.25));
      const ls = rr(0.62, 1.02);
      d.scale.set(ls, ls, ls);
      d.updateMatrix();
      leaves.setMatrixAt(li, d.matrix);
      c.setHSL(0.25 + rand() * 0.07, 0.25 + rand() * 0.2, 0.34 + rand() * 0.16);
      leaves.setColorAt(li, c);
      li++;
    }
  }
  leaves.count = li;
  culms.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (culms.instanceColor) culms.instanceColor.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  culms.frustumCulled = false;
  leaves.frustumCulled = false;
  return [culms, leaves];
}

/* ------------------------------------------------------------------ 古木 */

function tree({ x, z, y = GROUND, h = 6.2, crown = 3.2, lean = 0 }) {
  const grp = new THREE.Group();
  const trunks = [];
  let px = x, pz = z, py = y;
  const segs = 4;
  for (let k = 0; k < segs; k++) {
    const hh = h / segs;
    const r0 = 0.34 * (1 - k / segs) + 0.1;
    const g = new THREE.CylinderGeometry(r0 * 0.8, r0, hh + 0.12, 8);
    g.rotateZ(lean * (k + 1) * 0.16);
    g.translate(px, py + hh / 2, pz);
    trunks.push(g);
    px += Math.sin(lean * (k + 1) * 0.16) * hh * 0.5;
    py += hh;
  }
  // three main branches
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + rr(-0.4, 0.4);
    const L = rr(1.4, 2.4);
    const g = new THREE.CylinderGeometry(0.07, 0.16, L, 6);
    g.rotateZ(Math.PI / 2 - 0.5);
    g.rotateY(a);
    g.translate(px + Math.cos(a) * L * 0.35, py - 0.2, pz + Math.sin(a) * L * 0.35);
    trunks.push(g);
  }
  grp.add(mesh(trunks, BARK));
  const lobes = [];
  for (let k = 0; k < 3; k++) {
    const r = crown * rr(0.72, 1.05);
    const g = blobGeometry(r, { detail: 2, amp: 0.2, squash: 0.62, seed: x + z + k });
    g.translate(px + rr(-crown * 0.5, crown * 0.5), py + rr(-0.2, crown * 0.55), pz + rr(-crown * 0.5, crown * 0.5));
    lobes.push(g);
  }
  const canopy = mesh(lobes, M.foliage);
  canopy.name = 'tree-canopy';
  grp.add(canopy);
  grp.position.set(0, 0, 0);
  return grp;
}

const BARK = lit('#2c2620', { map: T.noise(), rough: 0.95 });

/* ------------------------------------------------------------------ 残荷 */

function lotus({ x, z, count = 46, spread = 1 }) {
  const grp = new THREE.Group();
  const discs = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(rr(0.7, 1.5) * spread, rr(0.7, 1.5) * spread);
    g.rotateX(-Math.PI / 2 + rr(-0.16, 0.16));
    g.rotateZ(rand() * 3.2);
    g.translate(x + rr(-13, 13) * spread, 0.1 + rr(0, 0.12), z + rr(-10, 10) * spread);
    discs.push(g);
  }
  const m = mesh(discs, M.lotus);
  m.name = 'lotus';
  grp.add(m);
  // a few seed heads on sticks: the silhouette of late autumn
  const stems = [], heads = [];
  for (let i = 0; i < 9; i++) {
    const px = x + rr(-11, 11) * spread, pz = z + rr(-8, 8) * spread, hh = rr(0.5, 1.1);
    stems.push(new THREE.CylinderGeometry(0.03, 0.04, hh, 5).translate(px, 0.1 + hh / 2, pz));
    heads.push(new THREE.CylinderGeometry(0.16, 0.1, 0.22, 8).translate(px, 0.1 + hh + 0.1, pz));
  }
  grp.add(mesh(stems, M.dark));
  const hm = mesh(heads, glow('#c6a06a', 0.5));
  hm.name = 'lotus-heads';
  grp.add(hm);
  return grp;
}

/* ------------------------------------------------------------------ assembly */

export function buildPlants(scene) {
  const group = new THREE.Group();
  group.name = 'plants';
  const R = GARDEN.river, P = GARDEN.pool;

  /* 竹: the grove west of the hill, then clumps that fringe the walks */
  const HALL = [-41.2, 21.6, -30.8, 30.4];      // 翠玲珑 的台基
  const TOWER = [-49.2, -2.4, -39.8, 6.4];      // 看山楼
  const STELE = [-33, 34.4, 9, 40.6];           // 碑廊与其前的碑壁
  const groves = [
    { x: -34, z: 29, rx: 13, rz: 11, count: 300, avoid: [HALL] },
    { x: -45, z: 12, rx: 5.5, rz: 8, count: 100, avoid: [TOWER] },
    { x: -18, z: 36, rx: 8, rz: 5, count: 120, avoid: [STELE] },
    { x: 24, z: 32, rx: 6, rz: 4.5, count: 70 },
    { x: 42, z: 26, rx: 4, rz: 5, count: 55 },
    // 园外: bamboo in the cracks of the north bank, seen through the 漏窗 side
    { x: -26, z: -24.4, rx: 16, rz: 2.2, count: 90 },
    { x: 12, z: -24.6, rx: 12, rz: 2, count: 70 },
  ];
  for (const g of groves) group.add(...bambooGrove(g));

  /* 古木: a few big ones inside the walls, older than the buildings */
  const trees = [
    { x: -2, z: 15, h: 7.4, crown: 3.4, lean: 0.1 },
    { x: 14, z: 8, h: 6.6, crown: 3, lean: -0.14 },
    { x: -22, z: -6, h: 7, crown: 3.2, lean: 0.08 },
    { x: 30, z: 34, h: 6.2, crown: 2.8, lean: -0.1 },
    { x: -12, z: 34, h: 7.6, crown: 3.6, lean: 0.05 },
    { x: 44, z: 12, h: 5.6, crown: 2.6, lean: 0.16 },
  ];
  for (const t of trees) group.add(tree(t));

  /* 残荷 in the inner pool */
  group.add(lotus({ x: P.xC, z: P.zC, count: 52, spread: 0.9 }));

  /* riverside reeds: a thin line of bamboo clusters along the far bank */
  const reeds = bambooGrove({ x: -58, z: R.zC - R.halfW - 1.6, rx: 30, rz: 1.6, count: 120 });
  for (const r of reeds) r.name = 'reeds';
  group.add(...reeds);

  scene.add(group);
  return { group, windUniforms };
}
