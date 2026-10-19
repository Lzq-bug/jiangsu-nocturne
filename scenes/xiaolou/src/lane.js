import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, box, rand, rr, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { LANE, KEY, SITE, lanePoint, laneHW, slope, yawAt } from './plan.js';

const SAMPLE = 240;
const xs = Array.from({ length: SAMPLE + 1 }, (_, i) =>
  LANE.xFrom + ((LANE.xTo - LANE.xFrom) * i) / SAMPLE);

const join = (parts, mat, opts = {}) => {
  const m = new THREE.Mesh(mergeGeometries(parts.filter(Boolean)), mat);
  m.castShadow = !!opts.cast;
  m.receiveShadow = !!opts.receive;
  return m;
};

/** 把几何先转角再位移，merge 之前必须烘进顶点 */
function at(geo, yaw, x, y, z) {
  geo.rotateY(yaw);
  geo.translate(x, y, z);
  return geo;
}

const segYaw = (p, q) => Math.atan2(p.z - q.z, q.x - p.x);

/** 条石路面：横巷排板，板缝略湿反月；中线一线更亮，月色就落在这条线上 */
function paving(group) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c6ccd8'), map: T.stone('#a8afbd'),
    roughness: 0.5, metalness: 0.08,
    emissive: new THREE.Color('#131c2e'), emissiveIntensity: 0.2,
  });
  const slabs = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x = xs[i], x2 = xs[i + 1];
    const hw = laneHW((x + x2) / 2) + 0.55;
    const n = Math.max(1, Math.round((x2 - x) / 0.72));
    for (let k = 0; k < n; k++) {
      const px = x + ((x2 - x) * (k + 0.5)) / n;
      const p = lanePoint(px);
      slabs.push(at(
        box(0.66 + rr(-0.03, 0.03), 0.14, hw * 2, 0, 0.07, 0),
        Math.atan(slope(px)) * -1, p.x, 0, p.z,
      ));
    }
  }
  group.add(join(slabs, mat, { receive: true }));

  const wet = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5a6f90'), roughness: 0.06, metalness: 0.6,
    emissive: new THREE.Color('#1b2a44'), emissiveIntensity: 0.34,
  });
  const strips = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const p = lanePoint(xs[i]), q = lanePoint(xs[i + 1]);
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    strips.push(at(box(len + 0.02, 0.05, 0.55), segYaw(p, q), (p.x + q.x) / 2, 0.155, (p.z + q.z) / 2));
  }
  group.add(join(strips, wet, { receive: true }));
}

/** 两侧界墙随弯起伏：白粉墙 + 青石勒脚 + 檐口压顶 */
function boundaryWalls(group) {
  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b4aa95'), map: T.plaster('#a69a83'), roughness: 0.95,
    emissive: new THREE.Color('#151a26'), emissiveIntensity: 0.12,
  });
  const plinthMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6e7482'), map: T.stone('#5c6270'), roughness: 0.86,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8f9aab'), map: T.roofTiles('#3a4258', '#4d566e', '#74829e'), roughness: 0.72,
  });

  for (const side of [-1, 1]) {
    const wall = [], plinth = [], cap = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const x = xs[i], x2 = xs[i + 1];
      const p = lanePoint(x, side * (laneHW(x) + 0.3));
      const q = lanePoint(x2, side * (laneHW(x2) + 0.3));
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const yaw = segYaw(p, q);
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      const h = 3.25 + 0.45 * Math.sin(x * 0.026 + side * 1.3) + 0.3 * Math.sin(x * 0.007);
      wall.push(at(box(len + 0.05, h, 0.42), yaw, mx, h / 2, mz));
      plinth.push(at(box(len + 0.05, 0.6, 0.62), yaw, mx, 0.3, mz));
      cap.push(at(box(len + 0.12, 0.22, 0.88), yaw, mx, h + 0.12, mz));
    }
    group.add(join(wall, wallMat, { cast: true, receive: true }));
    group.add(join(plinth, plinthMat, { receive: true }));
    group.add(join(cap, capMat, { cast: true }));
  }
}

/** 檐下与墙根的一线明沟 */
function gutters(group) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5c6270'), map: T.stone('#4a505c'), roughness: 0.8,
  });
  for (const side of [-1, 1]) {
    const parts = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const p = lanePoint(xs[i], side * (laneHW(xs[i]) + 0.05));
      const q = lanePoint(xs[i + 1], side * (laneHW(xs[i + 1]) + 0.05));
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      parts.push(at(box(len + 0.04, 0.1, 0.36), segYaw(p, q), (p.x + q.x) / 2, 0.16, (p.z + q.z) / 2));
    }
    group.add(join(parts, mat, { receive: true }));
  }
}

const crossYaw = (x) => Math.PI / 2 + Math.atan(slope(x));

/** 跨巷石坊：四柱三间，额题坊名（现存坊为街区改造新制） */
function archway(group, spec) {
  const a = lanePoint(spec.x);
  const grp = new THREE.Group();
  grp.position.set(a.x, 0, a.z);
  grp.rotation.y = crossYaw(spec.x);
  grp.add(new THREE.Group());

  const stone = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8d94a2'), map: T.stone('#7d8391'), roughness: 0.85,
    emissive: new THREE.Color('#141a28'), emissiveIntensity: 0.12,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c3140'), roughness: 0.8 });

  const H = spec.h;
  const half = laneHW(spec.x) + 1.0;
  const cols = [], bases = [], drums = [], ears = [];
  for (const s of [-1, 1]) {
    for (const t of [1, -1]) {
      const z = s * half;
      cols.push(box(0.74, H, 0.74, t * 0.0, H / 2 + 0.4, z));
      bases.push(box(1.02, 0.42, 1.02, 0, 0.21, z));
      drums.push(box(0.94, 0.3, 0.94, 0, H + 0.75, z));
      ears.push(box(1.4, 0.85, 0.32, 0, 0.8, s * (half + 0.95)));
    }
  }
  grp.add(join(cols, stone, { cast: true }));
  grp.add(join(bases, stone, { cast: true, receive: true }));
  grp.add(join(drums, stone, { cast: true }));
  grp.add(join(ears, stone, { cast: true }));

  const lintel = join([
    box(1.4, 0.6, half * 2 + 1.2, 0, H - 0.15, 0),
    box(1.7, 0.5, half * 2 + 1.8, 0, H + 0.95, 0),
    box(2.1, 0.34, half * 2 + 2.4, 0, H + 1.35, 0),
  ], dark, { cast: true });
  grp.add(lintel);

  // 额题面朝巷内：两块板，从巷里巷外都读得见
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 0.85),
      new THREE.MeshBasicMaterial({
        map: T.plaque(spec.text, { dir: 'h', bg: '#1b2a3a', fg: '#e8dcbe', border: '#8e97a6' }),
        toneMapped: false,
      }),
    );
    plate.position.set(s * 0.86, H + 0.42, 0);
    plate.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    grp.add(plate);
  }
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), glow('#ffd8a2', 2.4));
    lamp.position.set(0, H - 0.75, s * (half - 0.8));
    grp.add(lamp);
  }
  registerOccluder(grp, 2.4, new THREE.Vector3(a.x, 2, a.z));
  group.add(grp);
  return grp;
}

/** 巷边古井：青石井圈、井架辘轳，水面压得极低 */
function well(group) {
  const w = SITE.well;
  const p = lanePoint(w.x, w.off);
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const stone = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8b919e'), map: T.stone('#767c88'), roughness: 0.8,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a3323'), map: T.wood('#3d2a1c', '#241610'), roughness: 0.82,
  });
  const curb = new THREE.Mesh(new THREE.CylinderGeometry(w.r + 0.14, w.r + 0.22, 0.44, 16), stone);
  curb.position.y = 0.22;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(w.r, 0.15, 8, 20), stone);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.45;
  const water = new THREE.Mesh(new THREE.CircleGeometry(w.r - 0.02, 18),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#04070e'), roughness: 0.07, metalness: 0.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.16;
  grp.add(curb, ring, water);
  const frame = join([
    box(0.14, 1.5, 0.14, 0, 0.75, w.r + 0.3),
    box(0.14, 1.5, 0.14, 0, 0.75, -(w.r + 0.3)),
    box(0.16, 0.16, (w.r + 0.3) * 2, 0, 1.5, 0),
  ], wood, { cast: true });
  grp.add(frame);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 10), wood);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(0.22, 1.4, 0);
  grp.add(roll);
  registerOccluder(grp, 1.5, new THREE.Vector3(p.x, 1, p.z));
  group.add(grp);
  return grp;
}

/** 老树：干分歧、叶成团，夜里只剩剪影与筛下的月 */
function trees(group) {
  const bark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#33291f'), roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#22323c'), roughness: 0.95, flatShading: true,
    emissive: new THREE.Color('#0c1520'), emissiveIntensity: 0.17,
  });
  const list = [];
  for (const t of KEY.trees) {
    const p = lanePoint(t.x, t.off);
    const grp = new THREE.Group();
    grp.position.set(p.x, 0, p.z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.36, t.h * 0.62, 8), bark);
    trunk.position.y = t.h * 0.31;
    grp.add(trunk);
    for (let i = 0; i < 3; i++) {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, t.h * 0.4, 6), bark);
      limb.position.y = t.h * 0.6;
      limb.rotation.set(rr(-0.6, 0.6), rr(0, 3), rr(-0.6, 0.6));
      grp.add(limb);
    }
    const crown = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(t.r * rr(0.44, 0.8), 1), leaf);
      blob.position.set(rr(-t.r, t.r) * 0.8, t.h * rr(0.68, 0.96), rr(-t.r, t.r) * 0.8);
      crown.add(blob);
    }
    grp.add(crown);
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    grp.userData.crown = crown;
    grp.userData.sway = rand() * 6.28;
    group.add(grp);
    list.push(grp);
    registerOccluder(crown, 1.4, new THREE.Vector3(p.x, t.h * 0.8, p.z));
  }
  return list;
}

/** 今景：路灯、店招灯箱、监控杆——「今景灯火」开关直接管这一组 */
function modernProps(group) {
  const grp = new THREE.Group();
  grp.name = 'modern';
  const poleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b3242'), roughness: 0.6, metalness: 0.5 });

  const lamps = [];
  for (const l of KEY.modern.lamps) {
    const p = lanePoint(l.x, l.off);
    const inward = Math.sign(-l.off);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8), poleMat);
    shaft.position.y = 2.2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.09), poleMat);
    arm.position.set(inward * 0.42, 4.32, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.3), glow('#cfe0ff', 1.4));
    head.position.set(inward * 0.62, 4.24, 0);
    g.add(shaft, arm, head);
    const light = new THREE.PointLight(new THREE.Color('#9fc0ff'), 11, 19, 2.1);
    light.position.copy(head.position);
    // 隔一盏留一盏：路灯的亮面靠发光体与地面光斑，真实光源留给关键处
    if (lamps.length % 2 === 0) g.add(light);
    lamps.push(light);
    grp.add(g);
  }

  for (const s of KEY.modern.signs) {
    const p = lanePoint(s.x, s.side * (laneHW(s.x) + 0.42));
    const yaw = yawAt(s.x, s.side);
    const board = new THREE.Mesh(box(s.w, s.h, 0.16, 0, 0, 0),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#0f1626'), roughness: 0.7 }));
    board.position.set(p.x, s.y, p.z);
    board.rotation.y = yaw;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.86, s.h * 0.66),
      new THREE.MeshBasicMaterial({
        map: T.plaque(s.text, { dir: 'h', bg: '#0c1a28', fg: '#8ff0d2', border: '#2f6f66' }),
        toneMapped: false,
      }));
    // 面朝巷内：沿宅子正面的法线（局部 +Z）往巷里挪一点
    const inward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    face.position.set(p.x, s.y, p.z).addScaledVector(inward, 0.14);
    face.rotation.y = yaw;
    grp.add(board, face);
  }

  for (const x of [-102, 30, 78]) {
    const p = lanePoint(x, -(laneHW(x) + 0.4));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), poleMat);
    post.position.set(p.x, 1.6, p.z);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.2),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9ccd4'), roughness: 0.5 }));
    cam.position.set(p.x, 3.2, p.z);
    grp.add(post, cam);
  }
  group.add(grp);
  return { grp, lamps };
}

export function buildLane(scene) {
  const group = new THREE.Group();
  group.name = 'lane';
  scene.add(group);
  paving(group);
  gutters(group);
  boundaryWalls(group);
  const west = archway(group, { ...SITE.westArch, h: 5.4 });
  const east = archway(group, { ...SITE.eastArch, h: 5.1 });
  const w = well(group);
  const treeList = trees(group);
  const mod = modernProps(group);
  return { group, arches: [west, east], well: w, trees: treeList, modern: mod.grp, modernLamps: mod.lamps };
}
