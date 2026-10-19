import * as THREE from 'three';
import { M, glow, mesh, box, rand, rr, chineseRoof, ridgeOrnament, plaqueMesh, railingGeo } from '../kit.js';
import * as T from '../textures.js';
import { TM } from './surfaces.js';
import { WALL, CITY, faceZ } from './data.js';
import { dummy } from './geo.js';

/* ------------------------------------------------------------------ 殿 */
function hall({ x, z, w, d, h = 4.2, rot = 0, name = '', redWall = true }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const base = [box(w + 2.2, 0.7, d + 2.2, 0, 0.35, 0)];
  g.add(mesh(base, TM.stone));
  const body = [box(w, h, d, 0, 0.7 + h / 2, 0)];
  g.add(mesh(body, redWall ? M.redWall : M.wall));
  const roof = new THREE.Mesh(
    chineseRoof({ width: w, depth: d, height: h * 0.42, ridgeRatio: 0.4, overhang: 0.6 }),
    M.roof,
  );
  roof.position.y = 0.7 + h;
  g.add(roof);
  const ridge = new THREE.Mesh(
    ridgeOrnament({ width: w, depth: d, height: h * 0.42, ridgeRatio: 0.4, overhang: 0.6 }),
    M.ridge,
  );
  ridge.position.y = 0.7 + h;
  g.add(ridge);
  // 长窗里的灯
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.78, h * 0.56), M.lattice);
    win.position.set(0, 0.7 + h * 0.5, s * (d / 2 + 0.06));
    win.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(win);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, h, 8), M.pillar);
      p.position.set(sx * (w / 2 - 0.4), 0.7 + h / 2, -d / 2 + 0.5 + i * (d - 1) / 2);
      g.add(p);
    }
  }
  if (name) {
    const p = plaqueMesh(name, w * 0.5, 0.9, { dir: 'h', bg: '#1a2438', fg: '#f2dcae', border: '#c9974f' });
    p.position.set(0, 0.7 + h * 0.86, d / 2 + 0.7);
    g.add(p);
  }
  return g;
}

/* ------------------------------------------------------------------ 药师塔 */
/** 楼阁式 octagonal 塔：层数与高度都按夜景比例写意，具体形制以寺志为准 */
function pagoda({ x, z, h }) {
  const g = new THREE.Group();
  const tiers = 7;
  const stylobate = 1.6;
  const unit = (h - stylobate - 4.2) / tiers;
  const parts = [box(13, stylobate, 13, 0, stylobate / 2, 0)];
  g.add(mesh(parts, TM.stone));
  let y = stylobate;
  for (let i = 0; i < tiers; i++) {
    const r = 4.5 - i * 0.42;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, unit, 8), M.redWall);
    body.position.set(0, y + unit / 2, 0);
    g.add(body);
    const eave = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 1.5, r + 0.4, 0.5, 8, 1, true),
      M.roof,
    );
    eave.position.set(0, y + unit + 0.12, 0);
    g.add(eave);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r + 1.55, 0.85, 8), M.roof);
    cone.position.set(0, y + unit + 0.6, 0);
    cone.rotation.y = Math.PI / 8;
    g.add(cone);
    // 每层一圈灯，塔在夜里是一串亮环
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r + 0.15, 0.1, 6, 24),
      glow('#ffbe72', 1.9),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y + unit * 0.9, 0);
    g.add(ring);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.9, unit * 0.52), M.lattice);
    win.position.set(0, y + unit * 0.5, r * 0.95);
    g.add(win);
    const rail = new THREE.Mesh(railingGeo(r * 2.2, { height: 0.7, spacing: 0.8 }), M.stone);
    rail.position.set(0, y + unit * 0.02, r + 1.0);
    g.add(rail);
    y += unit + 0.55;
  }
  // 塔刹
  const finial = new THREE.Group();
  const stack = [
    new THREE.CylinderGeometry(0.5, 0.7, 1.1, 8),
    new THREE.SphereGeometry(0.62, 12, 8),
    new THREE.CylinderGeometry(0.09, 0.16, 2.2, 6),
  ];
  let fy = 0;
  for (const geo of stack) {
    const m = new THREE.Mesh(geo, M.gilt);
    m.position.y = fy + (geo.parameters.bottomRadius || 0.3) + 0.2;
    fy = m.position.y + 0.6;
    finial.add(m);
  }
  finial.position.y = y + 0.4;
  g.add(finial);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glow('#ffe0a8', 2.6));
  tip.position.y = y + 4.2;
  g.add(tip);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,206,140', 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(13, 13, 1);
  halo.position.y = y + 3.6;
  g.add(halo);
  const l = new THREE.PointLight(0xffb066, 150, 90, 2);
  l.position.set(0, h * 0.55, 6);
  g.add(l);
  g.position.set(x, WALL.innerGround - 0.4, z);
  return g;
}

/* ------------------------------------------------------------------ 市街剪影 */
function blocks({ zFrom, zTo, xFrom, xTo, count, low, high, tall }) {
  const g = new THREE.Group();
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x0d1322, fog: true });
  silhouette.toneMapped = false;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), silhouette, count);
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, count);
  const o = dummy();
  const win = [];
  for (let i = 0; i < count; i++) {
    const x = rr(xFrom, xTo), z = rr(zFrom, zTo);
    const modern = rand() < tall;
    const h = modern ? rr(28, 58) : rr(low, high);
    const w = modern ? rr(9, 15) : rr(7, 13);
    const d = modern ? rr(9, 14) : rr(6, 10);
    o.position.set(x, h / 2, z);
    o.rotation.set(0, rand() * 0.5, 0);
    o.scale.set(w, h, d);
    o.updateMatrix();
    body.setMatrixAt(i, o.matrix);
    if (modern) {
      roofs.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    } else {
      o.position.set(x, h + 1.1, z);
      o.scale.set(w * 0.8, 3.2, d * 0.7);
      o.updateMatrix();
      roofs.setMatrixAt(i, o.matrix);
    }
    o.scale.set(1, 1, 1);
    const n = modern ? 26 : 7;
    for (let k = 0; k < n; k++) {
      if (rand() > (modern ? 0.55 : 0.72)) continue;
      win.push(
        x + rr(-w * 0.42, w * 0.42),
        1.5 + rand() * (h - 2),
        z + (rand() > 0.5 ? d * 0.5 : -d * 0.5),
      );
    }
  }
  body.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,200,140', 0.2), size: 3.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  g.add(body, roofs, new THREE.Points(wg, wm));
  return g;
}

/* ------------------------------------------------------------------ 主入口 */
export function buildCity(scene, columns) {
  const group = new THREE.Group();
  group.name = 'taicheng-city';

  // 鸡鸣寺：山门—大殿—药师塔一线
  const t = CITY.temple;
  group.add(hall({ x: t.x, z: t.z + 22, w: 7.6, d: 5.4, h: 3.8, name: '鸡鸣寺', rot: Math.PI }));
  group.add(hall({ x: t.x, z: t.z, w: 11, d: 8, h: 5.2, name: '药师佛塔', rot: Math.PI }));
  group.add(pagoda(CITY.pagoda));
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), glow('#ff9d5c', 2.4));
    lamp.position.set(t.x + sx * 8, WALL.innerGround + 3.4, t.z + 20);
    group.add(lamp);
  }
  const templeLight = new THREE.PointLight(0xff9450, 210, 96, 2);
  templeLight.position.set(t.x, WALL.innerGround + 6, t.z + 12);
  group.add(templeLight);

  // 解放门外的城墙博物馆：一条压得很低的亮体块，落在墙与湖之间
  const m = CITY.museum;
  group.add(mesh([box(32, 7, 12, m.x, 3.4, m.z)], M.stoneDressed));
  group.add(mesh(box(32.6, 0.7, 12.6, m.x, 6.9, m.z), glow('#ffce93', 0.5)));
  group.add(mesh(box(31, 1.6, 12.4, m.x, 1.9, m.z), glow('#ffb877', 0.35)));

  // 城南：老城屋脊与几栋新楼
  group.add(blocks({ zFrom: 24, zTo: 300, xFrom: -370, xTo: 370, count: 420, low: 4, high: 13, tall: 0.07 }));
  // 湖对岸（西北）：新塔群，与城墙同框的那一层
  group.add(blocks({ zFrom: -190, zTo: -14, xFrom: -520, xTo: -300, count: 90, low: 16, high: 40, tall: 0.5 }));
  const farGlow = new THREE.PointLight(0x9fc0ff, 90, 260, 2);
  farGlow.position.set(CITY.modern.x, 40, CITY.modern.z);
  group.add(farGlow);

  // 城内一侧的沿墙马路灯
  const o = dummy();
  const n = 30;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 4.2, 6), M.ink, n);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), glow('#ffd79b', 2.1), n);
  let i = 0;
  for (let x = -360; x <= 360 && i < n; x += 24, i++) {
    const z = faceZ(x, WALL.innerGround, 1) + 5.5;
    o.rotation.set(0, 0, 0);
    o.position.set(x, WALL.innerGround + 2.1, z);
    o.updateMatrix();
    posts.setMatrixAt(i, o.matrix);
    o.position.set(x, WALL.innerGround + 4.2, z);
    o.updateMatrix();
    heads.setMatrixAt(i, o.matrix);
  }
  posts.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  group.add(posts, heads);

  scene.add(group);
  return { group, templeLight };
}
