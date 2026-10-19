import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, glow, rand, rr, registerOccluder, M } from './kit.js';
import { buildWater } from './water.js';
import { GROUND, WATER_Y, STATIONS, streamCenter, streamHalf, waterSD } from './data.js';

const ROWS = 9;

/** 溪 + 池 的水面：沿 Z 采样中心线，横向铺开并记住每一点离驳岸多近 */
function streamGeometry(z0, z1) {
  const pos = [], uv = [], idx = [], bank = [];
  const NZ = 190;
  for (let j = 0; j <= NZ; j++) {
    const z = z0 + ((z1 - z0) * j) / NZ;
    const c = streamCenter(z), hw = streamHalf(z);
    for (let i = 0; i < ROWS; i++) {
      const u = i / (ROWS - 1);
      const x = c + (u * 2 - 1) * hw;
      pos.push(x, WATER_Y, z);
      uv.push(u * 2, j / 8);
      bank.push(Math.min(1, Math.abs(u * 2 - 1) * 1.55));
    }
  }
  const row = ROWS;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i, b = a + row, c = a + 1, d = c + row;
      idx.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBank', new THREE.Float32BufferAttribute(bank, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 驳岸：沿水面轮廓叠一层石，压住水陆那条边 */
function copingStones(z0, z1) {
  const grp = new THREE.Group();
  const parts = [];
  const step = 0.62;
  for (let z = z0; z <= z1; z += step) {
    const c = streamCenter(z), hw = streamHalf(z);
    for (const s of [-1, 1]) {
      const x = c + s * (hw - 0.12);
      const y = Math.max(-0.35, Math.min(GROUND - 0.05, -0.05 + 0.9 * Math.max(0, (Math.abs(x - c) - hw + 1.4))));
      const w = rr(0.55, 1.05), d = rr(0.4, 0.75), h = rr(0.24, 0.5);
      const g = box(w, h, d, 0, y, 0);
      g.rotateY((s * 0.4 + rr(-0.2, 0.2)));
      g.translate(x, 0, z + rr(-0.18, 0.18));
      parts.push(g);
    }
  }
  if (parts.length) grp.add(new THREE.Mesh(mergeGeometries(parts), M.mxBrickDark));
  return grp;
}

/** 池心几块汀步与一具石矶，水面才不是一块整蓝布 */
function islets() {
  const grp = new THREE.Group();
  const spots = [[21.4, 4.2, 1.5], [23.2, 1.0, 1.1], [30.6, -1.8, 1.7], [27.2, 6.4, 0.9], [33.4, 3.2, 1.2]];
  const parts = [];
  for (const [x, z, r] of spots) {
    if (waterSD(x, z) > 0.3) continue;
    const n = 4 + Math.round(r * 2);
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, rad = rr(0.2, r);
      const g = new THREE.IcosahedronGeometry(rr(0.34, 0.7), 1).toNonIndexed();
      g.scale(1.2, rr(0.3, 0.55), 1.05);
      g.rotateY(a);
      g.translate(x + Math.cos(a) * rad, rr(-0.15, 0.34), z + Math.sin(a) * rad * 0.8);
      parts.push(g);
    }
  }
  grp.add(new THREE.Mesh(mergeGeometries(parts), M.rock));
  return grp;
}

/** 下水的石阶：贴着驳岸收进去，两级沉在水里，灯才照得着湿石头 */
function stepsToWater(x, z, rotY = 0) {
  const grp = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const y = GROUND - 0.06 - i * 0.4;
    grp.add(new THREE.Mesh(box(1.15, 0.14, 0.44, 0, y, -i * 0.42), M.ashl));
  }
  grp.position.set(x, 0, z);
  grp.rotation.y = rotY;
  return grp;
}

/** 菖蒲与芦：贴着水线一丛丛，但别长在机位前面 */
function reeds(z0, z1) {
  const grp = new THREE.Group();
  const blade = new THREE.ConeGeometry(0.05, 1, 3, 1, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c3a2e, roughness: 0.95, side: THREE.DoubleSide });
  mat.emissive = new THREE.Color('#0d1710'); mat.emissiveIntensity = 0.5;
  const dum = new THREE.Object3D();
  const eyes = STATIONS.map((s) => [s.pos[0], s.pos[2]]);
  const tufts = [];
  for (let z = z0; z <= z1; z += 1.15) {
    const c = streamCenter(z), hw = streamHalf(z);
    for (const [side, p] of [[-1, c - hw + rr(-0.2, 0.35)], [1, c + hw + rr(-0.35, 0.2)]]) {
      if (rand() > 0.55) continue;
      if (eyes.some(([ex, ez]) => Math.hypot(p - ex, z - ez) < 3.4)) continue;
      tufts.push([p, z]);
    }
  }
  const inst = new THREE.InstancedMesh(blade, mat, tufts.length * 9);
  let k = 0;
  for (const [x, z] of tufts) {
    const n = 6 + Math.round(rand() * 5);
    for (let i = 0; i < n && k < inst.count; i++) {
      const h = rr(0.32, 0.85);
      dum.position.set(x + rr(-0.28, 0.28), GROUND - 0.12 + h * 0.45, z + rr(-0.28, 0.28));
      dum.rotation.set(rr(-0.26, 0.26), rand() * 6.28, rr(-0.26, 0.26));
      dum.scale.set(1, h, 1);
      dum.updateMatrix();
      inst.setMatrixAt(k++, dum.matrix);
    }
  }
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  grp.add(inst);
  return grp;
}

export function buildStream(scene, moonDir, columns) {
  const water = buildWater(scene, streamGeometry(-22.5, 22.5), moonDir);
  const group = new THREE.Group();
  group.name = 'stream-bank';
  group.add(copingStones(-20.4, 20.4));
  group.add(islets());
  group.add(stepsToWater(17.9, -2.6, Math.PI / 2));
  group.add(stepsToWater(23.2, 7.6, Math.PI * 0.92));
  group.add(reeds(-20, 20));
  scene.add(group);

  // 水边灯的光柱只挂在那口池上，别在旱地上立一根水影
  const columnSpots = [
    [[17.6, -2.4], '#ffd7a0', 1.5, 6.5],
    [[26.6, 8.2], '#ffcf94', 1.2, 5.5],
    [[33.4, -12.6], '#ffb877', 1.5, 8],
    [[29.8, 2.0], '#cfe4ff', 2.4, 12],
  ];
  const colIdx = columnSpots.map(([p, color, w, d]) => columns.add(new THREE.Vector3(p[0], WATER_Y, p[1]), color, w, d, 1));
  registerOccluder(group.children[1], 2.4);
  return { water, group, colIdx };
}
