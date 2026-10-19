import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, mesh, box, rand, rr, figureGeo, registerOccluder } from '../kit.js';
import { willowGeo } from '../environment.js';
import { S, blossomTree, lampPost, singleArchBridge, stairGeo, pavilion } from './parts.js';
import { groundY } from './lake.js';
import { LAKE, channelAt } from './data.js';

/** 堤轴：贴着岸线走，两端不必硬拉成直线 */
function causewayX(z) {
  const { cx, w } = channelAt(z);
  return cx + w + 4.2;
}

function bermY(x, z, o, zc) {
  const g = groundY(x, z);
  const d = Math.max(0, Math.abs(o) - 3.2);
  const berm = 3.35 - 0.06 * d * d;
  // 两端收进土里，不要横切一道墙
  const taper = Math.min(1, Math.min(zc - LAKE.causeway.zFrom, LAKE.causeway.zTo - zc) / 12);
  return Math.max(g, g * (1 - taper) + berm * taper);
}

function buildCauseway(scene, anchors) {
  const grp = new THREE.Group();
  const zo = 3, oo = 1.7;
  const nz = Math.round((LAKE.causeway.zTo - LAKE.causeway.zFrom) / zo) + 1;
  const no = 9;
  const pos = [], uv = [], idx = [], col = [];
  const cPath = new THREE.Color('#5b6270'), cGrass = new THREE.Color('#26322a');
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    const z = LAKE.causeway.zFrom + j * zo;
    const xc = causewayX(z);
    for (let i = 0; i < no; i++) {
      const o = (i - (no - 1) / 2) * oo * 1.7;
      const x = xc + o;
      const y = bermY(x, z, o, z);
      pos.push(x, y, z);
      uv.push(x / 3.2, z / 3.2);
      tmp.lerpColors(cPath, cGrass, Math.min(1, Math.abs(o) / 4.2));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < no - 1; i++) {
      const a = j * no + i, b = a + 1, c = a + no, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 });
  mat.vertexColors = true;
  const berm = new THREE.Mesh(g, mat);
  berm.receiveShadow = true;
  grp.add(berm);

  // 两堤花柳：临水一行柳，背后一行桃
  const wGeo = willowGeo();
  for (let z = LAKE.causeway.zFrom + 7; z < LAKE.causeway.zTo - 4; z += 9.5) {
    const xc = causewayX(z);
    const lakeSide = rand() > 0.42;
    const x = xc + (lakeSide ? -2.1 : 2.6);
    const y = bermY(x, z, lakeSide ? -2.1 : 2.6, z);
    const s = rr(0.82, 1.3);
    const t = new THREE.Mesh(wGeo, S.willow);
    t.scale.set(s, s * rr(0.92, 1.12), s);
    t.position.set(x, y - 0.2, z + rr(-1.6, 1.6));
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, 4.4));
    const bx = xc + (lakeSide ? 3.4 : -3.6);
    const by = bermY(bx, z, lakeSide ? 3.4 : -3.6, z);
    const b = blossomTree(rr(0.7, 1.0));
    b.position.set(bx, by - 0.2, z + rr(-2, 2));
    grp.add(registerOccluder(b, 3.6));
    const z2 = z + 9.5;
    const xc2 = causewayX(z2);
    anchors.crowdPaths.push({ a: [xc, bermY(xc, z, 0, z), z], b: [xc2, bermY(xc2, z2, 0, z2), z2] });
  }

  for (let z = LAKE.causeway.zFrom + 12; z < LAKE.causeway.zTo - 6; z += 22) {
    const xc = causewayX(z);
    const y = bermY(xc - 1.2, z, -1.2, z);
    const lp = lampPost(3.1);
    lp.position.set(xc - 1.2, y, z);
    lp.rotation.y = Math.PI / 2;
    grp.add(lp);
    anchors.lampPosts.push(new THREE.Vector3(xc - 0.4, y + 2.82, z));
    if (z < 160) anchors.columns.push([xc - 0.4, '#ffbe72', 1.0, 7.5]);
  }

  // 堤上半座亭，给长堤一个落点
  const tz = 150;
  const tx = causewayX(tz) + 1.2;
  const pav = pavilion({ sides: 4, radius: 2.3, pillarH: 3.0, roofH: 2.2, plinth: 0.4 });
  pav.position.set(tx, bermY(tx, tz, 1.2, tz) - 0.1, tz);
  grp.add(pav);
  pav.userData.lamps.forEach((p) => anchors.eaves.push(p.clone().add(pav.position)));
  return grp;
}

function buildBridge24(scene, columns, anchors) {
  const { x, z, halfSpan } = LAKE.bridge24;
  const grp = new THREE.Group();
  const body = singleArchBridge({ span: halfSpan * 2, width: 5.4, deckH: 5.2, archR: 4.6 });
  grp.add(body);
  const deckTop = (t) => 5.2 * 0.32 + 5.2 * 0.68 * Math.sin(Math.PI * t) * 0.92 + 0.6;

  // 栏柱取二十四之数：两侧各十二，加台阶二十四级——现代复建的数字附会，写意照做
  const railParts = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const t = 0.16 + (0.68 * i) / 11;
      const px = -halfSpan + 2 * halfSpan * t;
      const py = deckTop(t) + 0.05;
      railParts.push(box(0.16, 0.9, 0.16, px, py + 0.45, s * 2.55));
      const cap = new THREE.CylinderGeometry(0.11, 0.13, 0.14, 8);
      cap.translate(px, py + 0.94, s * 2.55);
      railParts.push(cap);
      if (i < 11) {
        const t2 = 0.16 + (0.68 * (i + 1)) / 11;
        const x2 = -halfSpan + 2 * halfSpan * t2;
        const y2 = deckTop(t2) + 0.05;
        const len = Math.hypot(x2 - px, y2 - py);
        const rail = box(len, 0.09, 0.16, (px + x2) / 2, (py + y2) / 2 + 0.82, s * 2.55);
        rail.rotateZ(Math.atan2(y2 - py, x2 - px));
        railParts.push(rail);
      }
    }
    for (const dir of [-1, 1]) {
      const st = stairGeo(12, 0.44, 0.2, 3.0);
      const m = mesh(st, M.stoneDressed);
      m.position.set(dir * (halfSpan + 0.2), 0.2, s * 0.0);
      m.rotation.y = dir > 0 ? 0 : Math.PI;
      grp.add(m);
    }
  }
  const rail = new THREE.Mesh(mergeGeometries(railParts), M.stone);
  rail.castShadow = true;
  grp.add(rail);

  const pv = pavilion({ sides: 4, radius: 1.9, pillarH: 2.6, roofH: 1.8, plinth: 0.3 });
  pv.position.set(0, deckTop(0.5) + 0.1, 0);
  pv.rotation.y = Math.PI / 4;
  grp.add(pv);
  grp.updateMatrixWorld(true);
  pv.userData.lamps.forEach((p) => anchors.eaves.push(pv.localToWorld(p.clone())));

  // 玉人吹箫：诗里的形象，位置是写意
  const flute = new THREE.Mesh(figureGeo(1.0), new THREE.MeshStandardMaterial({ color: 0x2b2f3f, roughness: 0.9 }));
  flute.position.set(-3.4, deckTop(0.36) + 0.1, 1.2);
  flute.rotation.y = 1.2;
  grp.add(flute);
  const glow2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ffd9a0', 1.5));
  glow2.position.set(-3.4, deckTop(0.36) + 1.5, 1.2);
  grp.add(glow2);

  columns.add(new THREE.Vector3(0, 0.1, 0), '#ffd08a', 1.3, 10, 0.9);
  columns.add(new THREE.Vector3(-3.4, 0.1, 1.2), '#ffbe72', 0.9, 6, 0.7);
  grp.position.set(x, 0, z);
  anchors.bridgeTops.push(new THREE.Vector3(x, deckTop(0.5) + 1.7, z));
  return grp;
}

function buildRainbowBridge(scene, columns, anchors) {
  const { x, z, halfSpan } = LAKE.rainbowBridge;
  const grp = new THREE.Group();
  const body = singleArchBridge({ span: halfSpan * 2, width: 4.6, deckH: 4.2, archR: 4.0 });
  grp.add(body);
  const yTop = 4.2 * 0.32 + 4.2 * 0.68 * 0.92 + 0.6;
  const pv = pavilion({ sides: 4, radius: 2.1, pillarH: 2.7, roofH: 1.9, plinth: 0.3, roofMat: M.roofGreen });
  pv.position.set(0, yTop + 0.1, 0);
  pv.rotation.y = Math.PI / 4;
  grp.add(pv);
  grp.updateMatrixWorld(true);
  pv.userData.lamps.forEach((p) => anchors.eaves.push(pv.localToWorld(p.clone())));
  columns.add(new THREE.Vector3(x, 0.1, z), '#ffb066', 1.2, 9, 0.85);
  grp.position.set(x, 0, z);
  return grp;
}

/** 岸线整理：垒石、荷花、苇、码头台阶 */
function buildBankDressing(scene, anchors) {
  const grp = new THREE.Group();
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = S.rock;
  const n = 420;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, n);
  rocks.castShadow = rocks.receiveShadow = true;
  const d = new THREE.Object3D();
  let k = 0;
  for (let z = LAKE.zFrom + 8; z < LAKE.zTo - 8 && k < n; z += 4.2) {
    for (const side of [-1, 1]) {
      if (rand() > 0.62) continue;
      const { cx, w } = channelAt(z);
      const x = cx + side * (w + rr(-0.6, 1.6));
      const y = groundY(x, z);
      const s = rr(0.5, 1.5);
      d.position.set(x, y + s * 0.25, z + rr(-2, 2));
      d.rotation.set(rand() * 2, rand() * 6.28, rand() * 2);
      d.scale.set(s * rr(0.8, 1.4), s * rr(0.5, 0.9), s * rr(0.8, 1.4));
      d.updateMatrix();
      rocks.setMatrixAt(k++, d.matrix);
    }
  }
  rocks.count = k;
  rocks.instanceMatrix.needsUpdate = true;
  grp.add(rocks);

  // 荷：贴水圆盘，只在近岸浅水成滩
  const padGeo = new THREE.CircleGeometry(1, 9);
  padGeo.rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padGeo, S.lotus, 900);
  pads.frustumCulled = false;
  let pk = 0;
  for (let z = LAKE.zFrom + 12; z < LAKE.zTo - 12; z += 3.1) {
    for (const side of [-1, 1]) {
      const { cx, w } = channelAt(z);
      if (rand() > 0.55) continue;
      const span = rr(4, 13);
      for (let i = 0; i < 5; i++) {
        const x = cx + side * (w - rand() * span);
        const s = rr(0.42, 1.05);
        d.position.set(x + rr(-1.5, 1.5), 0.06 + Math.sin(z * 0.4) * 0.02, z + rr(-2, 2));
        d.rotation.set(0, rand() * 6.28, rr(-0.16, 0.16));
        d.scale.set(s, s, s);
        d.updateMatrix();
        if (pk < 900) pads.setMatrixAt(pk++, d.matrix);
      }
    }
  }
  pads.count = pk;
  pads.instanceMatrix.needsUpdate = true;
  grp.add(pads);

  // 岸柳与桃：鸟瞰下"两堤花柳全依水"全靠这一层读出来
  const wGeo = willowGeo();
  const willows = new THREE.InstancedMesh(wGeo, S.willow, 340);
  willows.castShadow = true;
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7, 1), S.blossom, 280);
  crowns.castShadow = true;
  let wi = 0, ci = 0;
  for (let z = LAKE.zFrom + 14; z < LAKE.zTo - 14; z += 6.5) {
    const { cx, w } = channelAt(z);
    for (const side of [-1, 1]) {
      if (rand() > 0.74) continue;
      // 东岸这一段已经是长堤春柳，别种两遍
      if (side > 0 && z > LAKE.causeway.zFrom - 12 && z < LAKE.causeway.zTo + 12) continue;
      const off = rr(4.5, 17);
      const x = cx + side * (w + off);
      const y = groundY(x, z);
      if (y < 1.3) continue;
      if (rand() > 0.42 && wi < 340) {
        const s = rr(0.68, 1.22);
        d.position.set(x, y - 0.3, z + rr(-2, 2));
        d.rotation.set(0, rand() * 6.28, 0);
        d.scale.set(s, s * rr(0.9, 1.15), s);
        d.updateMatrix();
        willows.setMatrixAt(wi++, d.matrix);
      } else if (ci < 280) {
        const s = rr(0.48, 0.86);
        d.position.set(x, y + 1.85 * s, z + rr(-2, 2));
        d.rotation.set(0, rand() * 6.28, 0);
        d.scale.set(s * rr(0.85, 1.2), s * rr(0.7, 1.05), s * rr(0.85, 1.2));
        d.updateMatrix();
        crowns.setMatrixAt(ci++, d.matrix);
      }
    }
  }
  willows.count = wi;
  crowns.count = ci;
  willows.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  grp.add(willows, crowns);

  // 码头：三处石阶下水，给画舫一个靠岸的理由
  for (const z of [42, 96, -96, -168]) {
    const { cx, w } = channelAt(z);
    const side = z > 0 ? 1 : -1;
    const x = cx + side * (w - 1.2);
    const st = stairGeo(7, 0.6, 0.34, 3.4);
    const m = mesh(st, M.stoneDressed);
    m.position.set(x + (side > 0 ? 2.4 : -2.4), -0.6, z);
    m.rotation.y = side > 0 ? Math.PI : 0;
    grp.add(m);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glow('#ffbe72', 1.7));
    lamp.position.set(x + side * 3.4, groundY(x + side * 3.4, z) + 3.0, z);
    grp.add(lamp);
    anchors.lampPosts.push(lamp.position.clone());
  }
  return grp;
}

export function buildShore(scene, columns) {
  const anchors = {
    eaves: [], lampPosts: [], windowGlow: [], bridgeLamps: [], archLamps: [],
    crowdPaths: [], columns: [], bridgeTops: [], stringEnds: [],
  };
  const group = new THREE.Group();
  group.add(buildCauseway(scene, anchors));
  group.add(buildBridge24(scene, columns, anchors));
  group.add(buildRainbowBridge(scene, columns, anchors));
  group.add(buildBankDressing(scene, anchors));
  scene.add(group);
  return { group, anchors };
}
