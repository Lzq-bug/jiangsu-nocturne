import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, mesh, box, plaqueMesh } from '../kit.js';
import { S, pavilion, archHole } from './parts.js';
import { LAKE } from './data.js';

const HALF = LAKE.bridge.halfSpan;
const WIDTH = LAKE.bridge.width;
export const BRIDGE = { halfSpan: HALF, width: WIDTH, arches: 15 };

/** 桥面母线：中央高、两端落回岸顶 */
export function deckY(x) {
  const t = Math.min(1, Math.abs(x) / HALF);
  return 2.5 + 6.1 * Math.pow(1 - t * t, 0.86);
}

/** 十五券洞：中央最宽最高，两侧依次收，墩宽基本等分 */
export function archLayout() {
  const pier = 0.92;
  const n = BRIDGE.arches;
  const c = (n - 1) / 2;
  const wt = [];
  for (let i = 0; i < n; i++) {
    const k = 1 - Math.abs(i - c) / c;
    wt.push(0.55 + 0.45 * Math.pow(k, 1.5));
  }
  const usable = HALF * 2 - pier * (n - 1);
  const sum = wt.reduce((a, b) => a + b, 0);
  const out = [];
  let x = -HALF + pier / 2;
  for (let i = 0; i < n; i++) {
    const w = (wt[i] / sum) * usable;
    const cx = x + w / 2;
    const r = w / 2;
    const top = deckY(cx) - 0.72;
    const baseY = 0.16;
    const spring = Math.max(baseY + 0.2, top - r);
    out.push({ cx, r, baseY, spring, top, index: i });
    x += w + pier;
  }
  return out;
}

function bridgeBodyGeo(arches) {
  const shape = new THREE.Shape();
  const steps = 60;
  shape.moveTo(-HALF - 1.2, -2.2);
  shape.lineTo(-HALF - 1.2, deckY(-HALF));
  for (let i = 0; i <= steps; i++) {
    const x = -HALF + (2 * HALF * i) / steps;
    shape.lineTo(x, deckY(x) + 0.34);
  }
  shape.lineTo(HALF + 1.2, deckY(HALF));
  shape.lineTo(HALF + 1.2, -2.2);
  shape.closePath();
  for (const a of arches) shape.holes.push(archHole(a.cx, a.baseY, a.r, a.top));
  const g = new THREE.ExtrudeGeometry(shape, { depth: WIDTH, bevelEnabled: false, curveSegments: 26 });
  g.translate(0, 0, -WIDTH / 2);
  g.computeVertexNormals();
  return g;
}

/** 桥面铺石：跟着母线起拱，中间略鼓 */
function deckGeo() {
  const nx = 74, nz = 10;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const z = -WIDTH / 2 + (WIDTH * j) / nz;
    for (let i = 0; i <= nx; i++) {
      const x = -HALF + (2 * HALF * i) / nx;
      const crown = 0.16 * Math.sin((j / nz) * Math.PI);
      pos.push(x, deckY(x) + 0.32 + crown, z);
      uv.push(x / 2.4, z / 2.4);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 两旁栏板与望柱，随桥面起伏 */
function railingSide(sign) {
  const parts = [];
  const z = sign * (WIDTH / 2 - 0.35);
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const x = -HALF + (2 * HALF * i) / n;
    const y = deckY(x) + 0.34;
    const post = box(0.19, 1.02, 0.19, x, y + 0.51, z);
    parts.push(post);
    const cap = new THREE.CylinderGeometry(0.13, 0.15, 0.16, 8);
    cap.translate(x, y + 1.08, z);
    parts.push(cap);
    if (i < n) {
      const x2 = -HALF + (2 * HALF * (i + 1)) / n;
      const y2 = deckY(x2) + 0.34;
      const len = Math.hypot(x2 - x, y2 - y);
      const panel = box(len, 0.5, 0.1, (x + x2) / 2, (y + y2) / 2 + 0.3, z);
      panel.rotateZ(Math.atan2(y2 - y, x2 - x));
      parts.push(panel);
    }
  }
  return mergeGeometries(parts);
}

/** 短廊：把四隅亭与中亭连成一组，廊顶低于亭檐 */
function corridor(from, to) {
  const grp = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const a = Math.atan2(dir.z, dir.x);
  const yMid = (from.y + to.y) / 2 - 0.35;
  const beam = box(len, 0.18, 1.5, 0, 2.5, 0);
  grp.add(mesh(beam, M.stone));
  const roof = new THREE.Mesh(chineseRoofSlab(len, 2.0, 0.9), M.roof);
  roof.position.y = 2.66;
  roof.rotation.y = -a;
  roof.castShadow = true;
  grp.add(roof);
  const n = Math.max(2, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (const s of [-1, 1]) {
      const px = -len / 2 + len * t;
      const pz = s * 0.9;
      grp.add(mesh(box(0.16, 2.5, 0.16, px, 1.25, pz), M.pillar));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow('#ffbe72', 1.5));
      lamp.position.set(px, 2.06, pz);
      grp.add(lamp);
      grp.userData.lamps = grp.userData.lamps || [];
      grp.userData.lamps.push(new THREE.Vector3(px, 2.06, pz));
    }
  }
  grp.position.set((from.x + to.x) / 2, yMid, (from.z + to.z) / 2);
  grp.rotation.y = -a;
  return grp;
}

/** 廊顶：一条窄的庑殿面，直接由 chineseRoof 切一段 */
function chineseRoofSlab(len, depth, height) {
  const pos = [], uv = [], idx = [];
  const nu = 18, nv = 8;
  const hw = len / 2 + 0.3, hd = depth / 2 + 0.2;
  const rx = hw * 0.55;
  const dxs = Math.max(0.001, hw - rx);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const x = -hw + (2 * hw * i) / nu;
      const z = -hd + (2 * hd * j) / nv;
      const dzN = Math.abs(z) / hd;
      const dxN = Math.max(0, Math.abs(x) - rx) / dxs;
      const t = Math.min(1, Math.max(dzN, dxN));
      const s = t * 0.42 + Math.sqrt(t) * 0.58;
      const y = height * (1 - s) + height * 0.2 * Math.pow(dzN, 4);
      pos.push(x, y, z);
      uv.push(x / 3.1, t * 1.4);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildFivePavilionBridge(scene, columns) {
  const group = new THREE.Group();
  group.name = 'wuting-bridge';
  const arches = archLayout();

  const body = new THREE.Mesh(bridgeBodyGeo(arches), S.bridgeStone);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const deck = new THREE.Mesh(deckGeo(), S.pavement);
  deck.receiveShadow = true;
  group.add(deck);
  group.add(new THREE.Mesh(railingSide(1), M.stone));
  group.add(new THREE.Mesh(railingSide(-1), M.stone));

  // 四翼：两端斜出的石翅，落进岸土里
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const wing = box(7.4, 2.6, 3.2, s * (HALF + 1.6), 1.2, t * (WIDTH / 2 + 0.6));
      const m = mesh(wing, M.stoneDark);
      m.rotation.y = s * t * 0.42;
      m.castShadow = true;
      group.add(m);
    }
  }

  const anchors = { bridgeLamps: [], archLamps: [], eaves: [], lampPosts: [], windowGlow: [], stringEnds: [] };

  /* 五亭：中亭重檐八角，四隅单檐方亭 */
  const apex = deckY(0) + 0.5;
  const center = pavilion({ sides: 8, radius: 3.05, pillarH: 3.7, roofH: 3.1, tiers: 2, plinth: 0.55, finialH: 1.5 });
  center.position.set(0, apex, 0);
  group.add(center);
  group.updateMatrixWorld(true);
  center.userData.lamps.forEach((p) => anchors.eaves.push(center.localToWorld(p.clone())));

  const plaque = plaqueMesh('五亭桥', 2.6, 0.92, { dir: 'h', bg: '#1b2f4d' });
  plaque.position.set(0, apex + 3.05, 3.3);
  group.add(plaque);
  const plaque2 = plaqueMesh('莲花桥', 2.6, 0.92, { dir: 'h', bg: '#3c1f1c' });
  plaque2.position.set(0, apex + 3.05, -3.3);
  plaque2.rotation.y = Math.PI;
  group.add(plaque2);

  const cornerSpots = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cornerSpots.push([sx * 11.6, sz * 3.6]);
  for (const [x, z] of cornerSpots) {
    const y = deckY(x) + 0.42;
    const pv = pavilion({ sides: 4, radius: 2.0, pillarH: 2.75, roofH: 1.95, tiers: 1, plinth: 0.42, finialH: 0.95 });
    pv.position.set(x, y, z);
    pv.rotation.y = Math.PI / 4;
    group.add(pv);
    group.updateMatrixWorld(true);
    pv.userData.lamps.forEach((p) => anchors.eaves.push(pv.localToWorld(p.clone())));
    // 灯影落进水中才撑得起"金色滉漾"
    columns.add(new THREE.Vector3(x, 0.1, z), '#ffc37a', 1.25, 8, 0.9);
  }

  for (const [x, z] of cornerSpots) {
    const from = new THREE.Vector3(x * 0.42, deckY(x * 0.42) + 0.5, z * 0.44);
    const to = new THREE.Vector3(x * 0.9, deckY(x * 0.9) + 0.5, z * 0.86);
    const c = corridor(from, to);
    group.add(c);
    group.updateMatrixWorld(true);
    (c.userData.lamps || []).forEach((p) => anchors.archLamps.push(c.localToWorld(p.clone())));
  }

  /* 券洞：洞心一盏，洞口一圈暖光，另在洞口下补一道水光 */
  for (const a of arches) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ffb46b', 2.1));
    lamp.position.set(a.cx, a.spring - 0.15, 0);
    group.add(lamp);
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(a.r * 0.98, 0.055, 5, 26, Math.PI), glow('#ffd9a4', 1.15));
      ring.position.set(a.cx, a.spring, s * (WIDTH / 2 + 0.02));
      ring.rotation.z = 0;
      group.add(ring);
    }
    anchors.archLamps.push(new THREE.Vector3(a.cx, a.spring - 0.15, 0));
    if (a.index % 2 === 0 || a.index === 7) {
      columns.add(new THREE.Vector3(a.cx, 0.12, a.r * 0.4), '#ffb066', 1.0, a.index === 7 ? 11 : 6.5, 0.85);
    }
  }

  /* 桥头：抱鼓石 + 石灯 + 台阶 */
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const drum = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 9, 0, Math.PI), M.stoneDressed);
      drum.position.set(s * (HALF - 0.3), deckY(HALF - 0.3) + 0.75, t * (WIDTH / 2 - 0.5));
      drum.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(drum);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.4, 8), M.stoneDark);
    post.position.set(s * (HALF + 2.4), 2.6, WIDTH / 2 - 1);
    group.add(post);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), glow('#ffbe72', 1.9));
    lantern.position.set(s * (HALF + 2.4), 4.5, WIDTH / 2 - 1);
    group.add(lantern);
    anchors.lampPosts.push(new THREE.Vector3(s * (HALF + 2.4), 4.5, WIDTH / 2 - 1));
    const lantern2 = lantern.clone();
    lantern2.position.z = -WIDTH / 2 + 1;
    group.add(lantern2);
    anchors.lampPosts.push(new THREE.Vector3(s * (HALF + 2.4), 4.5, -WIDTH / 2 + 1));
  }

  scene.add(group);
  return { group, arches, anchors, deckY };
}
