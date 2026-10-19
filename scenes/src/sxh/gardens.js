import * as THREE from 'three';
import { M, glow, mesh, box, rand, rr, registerOccluder, chineseRoof, ridgeOrnament, plaqueMesh, railingGeo } from '../kit.js';
import { willowGeo } from '../environment.js';
import { S, hall, pavilion, moonDoorWall, rockHeap, blossomTree, lampPost } from './parts.js';
import { groundY } from './lake.js';
import { LAKE } from './data.js';

const HR = LAKE.islet.r;

/** 小金山：堆土而成的岛，山顶到山脚一条 cos 曲线，岛上景物都按这个高度站 */
function islandY(x, z) {
  const d = Math.hypot(x - LAKE.islet.x, z - LAKE.islet.z);
  const t = Math.min(1, d / HR);
  const crown = 5.6 * Math.pow(Math.max(0, 1 - t * t), 0.82);
  const ridge = 0.5 * Math.sin((x + z) * 0.22) * (1 - t);
  if (d > HR) return Math.max(-2.8, crown - (d - HR) * 2.1);
  return crown + ridge + 0.35;
}

function buildIslet(scene, anchors) {
  const grp = new THREE.Group();
  const seg = 34, rings = 12;
  const pos = [], uv = [], idx = [], col = [];
  const cTop = new THREE.Color('#31413a'), cWall = new THREE.Color('#5d6472'), cBed = new THREE.Color('#0b1119');
  const tmp = new THREE.Color();
  for (let j = 0; j <= rings; j++) {
    const r = (j / rings) * (HR + 3.4);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = 1 + 0.13 * Math.sin(a * 3.2 + 0.7) + 0.08 * Math.sin(a * 7.1);
      const x = LAKE.islet.x + Math.cos(a) * r * wob;
      const z = LAKE.islet.z + Math.sin(a) * r * wob * 1.12;
      pos.push(x, islandY(x, z), z);
      uv.push(x / 4, z / 4);
      const t = r / HR;
      if (t > 1.05) tmp.copy(cBed);
      else if (t > 0.82) tmp.lerpColors(cWall, cTop, (1.05 - t) / 0.23);
      else tmp.copy(cTop);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  mat.vertexColors = true;
  const hill = new THREE.Mesh(g, mat);
  hill.receiveShadow = true;
  hill.castShadow = true;
  grp.add(hill);

  // 环岛的叠石驳岸
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = HR + rand() * 2.4;
    const x = LAKE.islet.x + Math.cos(a) * r, z = LAKE.islet.z + Math.sin(a) * r * 1.1;
    const rk = rockHeap(rr(0.5, 0.9));
    rk.position.set(x, Math.min(1.2, islandY(x, z)), z);
    grp.add(rk);
  }

  // 岛上桃柳
  const wGeo = willowGeo();
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = rr(3, HR - 1.5);
    const x = LAKE.islet.x + Math.cos(a) * r, z = LAKE.islet.z + Math.sin(a) * r * 1.1;
    const y = islandY(x, z);
    if (y < 1.4) continue;
    let node;
    if (rand() > 0.42) {
      const s = rr(0.7, 1.05);
      node = new THREE.Mesh(wGeo, S.willow);
      node.scale.set(s, s * rr(0.9, 1.1), s);
      node.rotation.y = rand() * 6.28;
      node.castShadow = true;
    } else {
      node = blossomTree(rr(0.6, 0.9));
    }
    node.position.set(x, y - 0.25, z);
    grp.add(registerOccluder(node, 4.0));
    if (rand() > 0.82) anchors.lampPosts.push(new THREE.Vector3(x, y + 1.2, z));
  }

  // 风亭、月观、琴室——岛上三处有名字的地方
  // 单独成组：土山本身不能进倒影，否则鸟瞰下水面会浮出一片灰色滩涂
  const struct = new THREE.Group();
  const spots = [
    { id: 'wind', dx: 3.5, dz: 11, kind: 'pav' },
    { id: 'yueguan', dx: -6.5, dz: 1.5, kind: 'hall', sign: '月观' },
    { id: 'qinshi', dx: -9, dz: 10, kind: 'hall', sign: '琴室' },
  ];
  grp.add(struct);
  for (const sp of spots) {
    const x = LAKE.islet.x + sp.dx, z = LAKE.islet.z + sp.dz;
    const y = islandY(x, z);
    let node;
    if (sp.kind === 'pav') {
      node = pavilion({ sides: 4, radius: 2.0, pillarH: 2.6, roofH: 1.85, plinth: 0.4 });
      node.rotation.y = Math.PI / 4;
    } else {
      node = hall({ width: 8.2, depth: 5.6, height: 3.3, bays: 2, sign: sp.sign, wallMat: S.screen });
      node.rotation.y = Math.atan2(LAKE.bridge.z - z, 0 - x) + Math.PI / 2;
    }
    node.position.set(x, y - 0.25, z);
    struct.add(node);
    grp.updateMatrixWorld(true);
    node.userData.lamps.forEach((p) => anchors.eaves.push(node.localToWorld(p.clone())));
    (node.userData.windowGlow || []).forEach((p) => anchors.windowGlow.push(node.localToWorld(p.clone())));
  }
  scene.add(grp);
  return struct;
}

/**
 * 钓鱼台（吹台）：三面满月洞门，主洞对准五亭桥。
 * 朝向用 lookAt 交给桥心，比手算方位角可靠——洞门开在局部 +Z。
 */
function buildFishingPlatform(scene, anchors) {
  const x = LAKE.fishing.x, z = LAKE.fishing.z;
  const y = islandY(x, z);
  const grp = new THREE.Group();
  const plat = new THREE.Mesh(box(8.4, 0.55, 8.4, 0, 0.28, 0), M.stoneDressed);
  plat.receiveShadow = true;
  grp.add(plat);
  const wallH = 4.3;
  const front = new THREE.Mesh(moonDoorWall({ width: 8.4, height: wallH, r: 1.62, thickness: 0.45 }), S.screen);
  front.position.set(0, 0.55, 3.95);
  front.castShadow = front.receiveShadow = true;
  const side1 = new THREE.Mesh(moonDoorWall({ width: 8.4, height: wallH * 0.94, r: 1.22, thickness: 0.42 }), S.screen);
  side1.position.set(3.95, 0.55, 0);
  side1.rotation.y = Math.PI / 2;
  const side2 = side1.clone();
  side2.position.x = -3.95;
  const back = new THREE.Mesh(box(8.4, wallH, 0.45, 0, 0.55 + wallH / 2, -3.95), S.screen);
  for (const m of [side1, side2, back]) { m.castShadow = m.receiveShadow = true; }
  grp.add(front, side1, side2, back);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, wallH, 9), M.pillar);
    p.position.set(sx * 3.6, 0.55 + wallH / 2, sz * 3.6);
    grp.add(p);
  }
  const roof = new THREE.Mesh(chineseRoof({ width: 8.4, depth: 8.4, height: 2.6, curve: 0.58, eaveLift: 0.6 }), M.roof);
  roof.position.y = 0.55 + wallH;
  roof.castShadow = true;
  grp.add(roof);
  grp.add(mesh(ridgeOrnament({ width: 8.4, depth: 8.4, height: 2.6 }), M.ridge));
  const sign = plaqueMesh('钓鱼台', 2.2, 0.8, { dir: 'h', bg: '#1b2f4d' });
  sign.position.set(0, 0.55 + wallH * 0.82, 4.25);
  grp.add(sign);

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 7), glow('#ffd39a', 1.7));
  lantern.position.set(0, 0.55 + wallH * 0.6, 1.4);
  grp.add(lantern);
  anchors.archLamps.push(new THREE.Vector3(x, 0.55 + wallH * 0.6, z + 1.4));
  const rail = railingGeo(8.4, { height: 0.72, spacing: 1.1 });
  for (const [px, pz, ry] of [[0, 4.5, 0], [0, -4.5, Math.PI], [4.5, 0, Math.PI / 2], [-4.5, 0, -Math.PI / 2]]) {
    const r = new THREE.Mesh(rail, M.stone);
    r.position.set(px, 0.55, pz);
    r.rotation.y = ry;
    grp.add(r);
  }

  grp.position.set(x, y, z);
  grp.lookAt(new THREE.Vector3(0, y, LAKE.bridge.z));
  scene.add(grp);
  return grp;
}

/** 熙春台：西岸双层绿琉璃阁，与五亭桥隔水相对 */
function buildXichun(scene, anchors, columns) {
  const x = LAKE.xichun.x, z = LAKE.xichun.z;
  const y = groundY(x, z);
  const grp = new THREE.Group();
  const terrace = new THREE.Mesh(box(17, 1.5, 12, 0, 0.75, 0), M.stoneDressed);
  terrace.receiveShadow = true;
  grp.add(terrace);
  grp.add(mesh(box(17.6, 0.5, 2.4, 0, 0.25, 7.1), M.stoneDressed));

  const lower = hall({ width: 13.2, depth: 8.6, height: 4.4, bays: 4, roofMat: M.roofGreen, wallMat: S.screen });
  lower.position.y = 1.5;
  grp.add(lower);

  const midY = 1.5 + lower.userData.eaveY - lower.position.y;
  const balcony = new THREE.Mesh(box(11.6, 0.35, 7.6, 0, midY + 0.18, 0), M.stoneDressed);
  grp.add(balcony);
  const bRail = railingGeo(11.6, { height: 0.86, spacing: 1.2 });
  const sRail = railingGeo(7.6, { height: 0.86, spacing: 1.2 });
  for (const [px, pz, ry] of [[0, 3.5, 0], [0, -3.5, Math.PI]]) {
    const r = new THREE.Mesh(bRail, M.stone);
    r.position.set(px, midY + 0.4, pz);
    r.rotation.y = ry;
    grp.add(r);
  }
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(sRail, M.stone);
    r.position.set(s * 5.5, midY + 0.4, 0);
    r.rotation.y = Math.PI / 2;
    grp.add(r);
  }

  const upper = hall({ width: 9.2, depth: 6.2, height: 3.6, bays: 3, sign: '熙春台', roofMat: M.roofGreen, wallMat: S.screen });
  upper.position.y = midY + 0.35;
  grp.add(upper);

  for (const s of [-1, 1]) {
    const lp = lampPost(3.2);
    lp.position.set(s * 7.4, 1.5, 5.6);
    grp.add(lp);
  }

  grp.position.set(x, y, z);
  grp.lookAt(new THREE.Vector3(0, y, LAKE.bridge.z));
  grp.updateMatrixWorld(true);
  // 锚点在 lookAt 之后再取，否则世界坐标跟着台身转过了头
  for (const h of [lower, upper]) {
    h.userData.lamps.forEach((p) => anchors.eaves.push(h.localToWorld(p.clone())));
    h.userData.windowGlow.forEach((p) => anchors.windowGlow.push(h.localToWorld(p.clone())));
  }
  columns.add(new THREE.Vector3(x + 4, 0.12, z + 5), '#ffbe72', 1.7, 12, 0.95);
  columns.add(new THREE.Vector3(x - 4, 0.12, z + 3), '#ffb066', 1.3, 9, 0.8);
  scene.add(grp);
  return grp;
}

export function buildGardens(scene, columns) {
  const anchors = {
    eaves: [], lampPosts: [], windowGlow: [], archLamps: [], crowdPaths: [], stringEnds: [],
  };
  const group = new THREE.Group();
  group.add(buildIslet(scene, anchors));
  group.add(buildFishingPlatform(scene, anchors));
  group.add(buildXichun(scene, anchors, columns));
  scene.add(group);
  return { group, anchors };
}
