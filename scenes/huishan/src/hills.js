import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, lit, box, mesh, rand, rr } from './kit.js';
import * as T from './textures.js';
import { groundPad } from './build.js';
import { HILLS, PAGODA, CANAL, CREEK, STATIONS } from './data.js';
import { MOON_DIR } from './sky.js';

/* ------------------------------------------------------------------ 山体 */

/** 一座写意的山：高程直接取 HILLS.hillY，机位与树用的是同一个函数 */
function hillMesh(m, { seg = 60 } = {}) {
  const pos = [], uv = [], idx = [], col = [];
  const cLow = new THREE.Color('#080d17'), cHigh = new THREE.Color('#3b4a63');
  const shade = new THREE.Color();
  const d = 1.6;
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const gx = i / seg - 0.5, gz = j / seg - 0.5;
      const x = m.x + gx * m.rx * 2, z = m.z + gz * m.rz * 2;
      const y = HILLS.hillY(x, z);
      pos.push(x, y, z);
      uv.push(i / seg, j / seg);
      // 月照到的那一面提亮，背光面留在黑里——夜里山只剩这一条明暗
      const nx = -(HILLS.hillY(x + d, z) - HILLS.hillY(x - d, z)) / (2 * d);
      const nz = -(HILLS.hillY(x, z + d) - HILLS.hillY(x, z - d)) / (2 * d);
      const inv = 1 / Math.hypot(nx, 1, nz);
      const k = Math.max(0, (nx * MOON_DIR.x + MOON_DIR.y + nz * MOON_DIR.z) * inv);
      shade.copy(cLow).lerp(cHigh, 0.1 + 0.9 * Math.pow(k, 1.6) * Math.min(1, y / 26));
      col.push(shade.r, shade.g, shade.b);
    }
  }
  const row = seg + 1;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 山坡上的树：剪影锥体。机位与塔下留空地，不然相机埋进树冠 */
function treeLine(group, m, count, { tint = 0x0b1220, scale = 1 } = {}) {
  const cone = new THREE.ConeGeometry(1, 2.6, 5, 1);
  cone.translate(0, 1.3, 0);
  const inst = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({
    color: tint, roughness: 0.95, emissive: 0x0a1220, emissiveIntensity: 0.5,
  }), count);
  const d = new THREE.Object3D();
  const clear = (x, z) => {
    for (const s of STATIONS) if (Math.hypot(s.pos[0] - x, s.pos[2] - z) < 15) return false;
    if (Math.hypot(PAGODA.x - x, PAGODA.z - z) < 26) return false;
    for (const t of HILLS.trail) if (Math.hypot(t[0] - x, t[1] - z) < 7) return false;
    return true;
  };
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 12) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
    const x = m.x + Math.cos(a) * r * m.rx * 0.96;
    const z = m.z + Math.sin(a) * r * m.rz * 0.96;
    const y = HILLS.hillY(x, z);
    if (y < 4 || !clear(x, z)) continue;
    const s = (0.5 + rand() * 0.9) * scale;
    d.position.set(x, y - 0.3, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, s * rr(0.9, 1.5), s);
    d.updateMatrix();
    inst.setMatrixAt(placed++, d.matrix);
  }
  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);
  return inst;
}

/** 登山道：一串石阶块 + 灯点，从寺后爬到山脊 */
function trail(group) {
  const steps = [], lamps = [];
  for (let i = 0; i < HILLS.trail.length - 1; i++) {
    const [x0, z0] = HILLS.trail[i], [x1, z1] = HILLS.trail[i + 1];
    const y0 = HILLS.hillY(x0, z0) + 0.4, y1 = HILLS.hillY(x1, z1) + 0.4;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(4, Math.round(len / 2.2));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      steps.push(box(2.6, 0.34, 1.9, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t));
    }
    lamps.push([x0, y0 + 2.6, z0]);
  }
  group.add(mesh(steps, M.stoneDark));
  const glowGeo = [];
  for (const [x, y, z] of lamps) {
    const s = new THREE.SphereGeometry(0.34, 8, 6);
    s.translate(x, y, z);
    glowGeo.push(s);
  }
  group.add(mesh(glowGeo, glow('#ffcf94', 2.2)));
  // 灯下的小光晕，远看才不像是画上去的点
  for (const [x, y, z] of lamps) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,196,130', 0.14), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    sp.position.set(x, y, z);
    sp.scale.set(7, 7, 1);
    group.add(sp);
  }
  return lamps;
}

/* ------------------------------------------------------------------ 龙光塔 */

export function buildPagoda(scene) {
  const grp = new THREE.Group();
  grp.name = 'pagoda';
  const base = PAGODA.baseY;
  const { r0, storeys, height, taper } = PAGODA;
  const body = [], eaves = [], rails = [], lamps = [], winSlots = [];
  let y = 0, r = r0;
  const storeyH = height / storeys;
  for (let s = 0; s < storeys; s++) {
    const h = storeyH * (s === 0 ? 1.25 : 1) * (1 - 0.03 * s);
    // 塔身：八角鼓形，逐层收分
    const g = new THREE.CylinderGeometry(r * taper, r, h, 8, 1, false);
    g.translate(0, y + h / 2, 0);
    body.push(g);
    // 腰檐：一圈出挑的八角叠涩
    const eaveR = r * 1.42;
    const eave = new THREE.CylinderGeometry(r * 0.92, eaveR, 0.62, 8, 1, false);
    eave.translate(0, y + h + 0.1, 0);
    eaves.push(eave);
    const flare = new THREE.CylinderGeometry(eaveR * 0.72, eaveR * 1.06, 0.5, 8, 1, true);
    flare.translate(0, y + h + 0.5, 0);
    eaves.push(flare);
    // 平座栏杆
    const rail = new THREE.TorusGeometry(eaveR * 0.86, 0.14, 4, 8);
    rail.rotateX(Math.PI / 2);
    rail.translate(0, y + h + 0.75, 0);
    rails.push(rail);
    // 每层五个真窗 + 门，位置交替
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (s % 2 ? Math.PI / 8 : 0);
      if ((k + s) % 3 === 0) {
        const w = new THREE.BoxGeometry(0.9, 1.5, 0.3);
        w.translate(Math.cos(a) * r * 1.01, y + h * 0.52, Math.sin(a) * r * 1.01);
        w.rotateY(-a);
        winSlots.push(w);
      }
      // 檐角灯
      const lx = Math.cos(a) * eaveR * 1.02, lz = Math.sin(a) * eaveR * 1.02;
      const dot = new THREE.SphereGeometry(0.26, 7, 5);
      dot.translate(lx, y + h + 0.62, lz);
      lamps.push(dot);
    }
    y += h + 0.62;
    r *= taper;
  }
  // 塔刹：覆钵 + 相轮 + 宝珠
  const finial = [];
  const bowl = new THREE.SphereGeometry(r * 0.62, 12, 8);
  bowl.translate(0, y + 0.6, 0);
  finial.push(bowl);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.TorusGeometry(1.05 - i * 0.13, 0.1, 5, 12);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, y + 1.6 + i * 0.62, 0);
    finial.push(ring);
  }
  const bead = new THREE.SphereGeometry(0.46, 10, 8);
  bead.translate(0, y + 5.1, 0);
  finial.push(bead);

  grp.add(mesh(body, lit('#c3c8d2', { map: T.stone('#a7adba'), rough: 0.86, emissive: '#141a28', ei: 0.6 })));
  grp.add(mesh(eaves, lit('#5a5346', { map: T.roofTiles('#2f3346', '#4c536b', '#767f97'), rough: 0.8, side: THREE.DoubleSide })));
  grp.add(mesh(rails, M.stoneDressed));
  grp.add(mesh(finial, M.gilt));
  grp.add(mesh(winSlots, glow('#ffbe72', 1.5)));
  const lampMesh = mesh(lamps, glow('#ffd79b', 1.9));
  grp.add(lampMesh);

  // 底层门洞与一圈塔基
  const plinth = new THREE.CylinderGeometry(r0 * 1.5, r0 * 1.66, 1.5, 8);
  plinth.translate(0, -0.7, 0);
  grp.add(mesh(plinth, M.stoneDark));
  const door = box(2.0, 3.2, 0.6, 0, 1.7, r0 * 0.98);
  grp.add(mesh(door, glow('#ff9f57', 1.3)));

  grp.position.set(PAGODA.x, base, PAGODA.z);
  scene.add(grp);

  // 塔身整体的柔光：夜景里塔是一根光柱，但不能糊成一团
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,206,150', 0.2), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.position.set(PAGODA.x, base + height * 0.5, PAGODA.z);
  halo.scale.set(19, 27, 1);
  scene.add(halo);

  return { group: grp, halo, lampMesh, height, top: base + y + 5.6 };
}

/* ------------------------------------------------------------------ 远景 */

/** 运河口与城内的灯线：鸟瞰与街端都需要这条地平线 */
function distantTown(scene) {
  const grp = new THREE.Group();
  const pts = [];
  const warm = [];
  for (let i = 0; i < 620; i++) {
    const a = rand() * Math.PI * 2;
    const band = 470 + Math.pow(rand(), 0.6) * 210;
    const x = Math.cos(a) * band * 0.9 + 30;
    const z = Math.abs(Math.sin(a)) * band * 0.7 + 240;
    // 运河带里不撒灯，否则点上水去了
    if (Math.abs(x - CANAL.band.cx) < CANAL.band.hw && Math.abs(z - CANAL.band.cz) < CANAL.band.hd) continue;
    const y = 3 + rand() * 16;
    pts.push(x, y, z);
    if (rand() > 0.55) warm.push(x, y + rand() * 4, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  grp.add(new THREE.Points(g, new THREE.PointsMaterial({
    map: T.softGlow('255,205,150', 0.2), size: 4.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true,
  })));
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(warm), 3));
  grp.add(new THREE.Points(g2, new THREE.PointsMaterial({
    map: T.softGlow('180,215,255', 0.2), size: 3.0, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true,
  })));
  // 屋顶的黑色起伏，让灯线有个来处
  const roofGeo = new THREE.ConeGeometry(1, 0.6, 4, 1);
  const sil = new THREE.MeshBasicMaterial({ color: 0x070a13, fog: true });
  sil.toneMapped = false;
  const inst = new THREE.InstancedMesh(roofGeo, sil, 340);
  const d = new THREE.Object3D();
  for (let i = 0; i < 340; i++) {
    const a = rand() * Math.PI * 2;
    const band = 430 + Math.pow(rand(), 0.7) * 240;
    const x = Math.cos(a) * band * 0.9 + 30;
    const z = Math.abs(Math.sin(a)) * band * 0.62 + 250;
    const h = 6 + rand() * 12;
    d.position.set(x, h * 0.5, z);
    d.rotation.set(0, rand() * Math.PI, 0);
    d.scale.set(9 + rand() * 8, 3.2 + rand() * 2, 7 + rand() * 6);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  grp.add(inst);
  scene.add(grp);
  return grp;
}

/** 更外围的山影：一条只做剪影的环带，把整个镇子收进谷地 */
function outerRidge(scene) {
  const pts = [], col = [], idx = [];
  const seg = 150;
  const cLow = new THREE.Color('#04070e'), cHigh = new THREE.Color('#0d1422');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    // 西面把惠山顶高，东面留给运河口的低岗
    const west = Math.pow(Math.max(0, -z), 2.2);
    const bump = Math.abs(Math.sin(a * 2.1 + 1.2)) * 30 + Math.abs(Math.sin(a * 5.3)) * 12;
    const R = 690;
    const h = 26 + bump + west * 96;
    pts.push(x * R, -8, z * R * 0.86 + 20, x * R, h, z * R * 0.86 + 20);
    col.push(...cLow.toArray(), ...cHigh.toArray());
    if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  m.toneMapped = false;
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ 底面 */

/** 一整张兜住全镇，但把浜与镇北的运河挖开，水面才露得出来 */
function groundBase(scene) {
  const m = lit('#1b2331', { map: T.stone('#2f3746'), rough: 0.96, emissive: '#141d2c', ei: 0.6 });
  // 底面压到水面以下，浜与运河的水面直接盖在上面：
  // 挖洞的三角化在带两个洞时会塌成两片，不如让水盖地来得稳。
  const pad = groundPad({ x0: -430, x1: 430, z0: -430, z1: 470, y: -0.6, mat: m });
  scene.add(pad);
  return pad;
}

/** 黄埠墩：运河里的一方小岛，岛上一亭一灯 */
function island(scene) {
  const grp = new THREE.Group();
  const { x, z, r } = CANAL.island;
  const y = CANAL.band.y;
  const base = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const g = new THREE.IcosahedronGeometry(rr(1.1, 2.1), 0);
    g.scale(1.4, 0.5, 1.1);
    g.translate(x + Math.cos(a) * r, y + rr(-0.4, 0.5), z + Math.sin(a) * r);
    base.push(g);
  }
  grp.add(mesh(base, M.stoneDark));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 20), lit('#1b2430', { rough: 0.95 }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(x, y + 0.35, z);
  grp.add(fill);
  const posts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) posts.push(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 7).translate(sx * 1.3, y + 1.1, sz * 1.3));
  }
  grp.add(mesh(posts, M.pillar));
  const hut = new THREE.Mesh(chineseRoofLite(4.6, 4.6, 1.4), lit('#222a3a', { rough: 0.9, emissive: '#0b1220', ei: 0.5 }));
  hut.position.set(x, y + 2.2, z);
  grp.add(hut);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), glow('#ffb06a', 2.2));
  dot.position.set(x, y + 1.7, z);
  grp.add(dot);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,180,110', 0.16), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.position.set(x, y + 1.8, z);
  halo.scale.set(15, 15, 1);
  grp.add(halo);
  scene.add(grp);
  return grp;
}

/**
 * 镇南民居：寄畅园借景那条视线要过一段屋脊，
 * 不然从池子到锡山之间是一片空地，塔就像浮在平原上。
 */
function suburb(scene) {
  const grp = new THREE.Group();
  const sil = new THREE.MeshBasicMaterial({ color: 0x080c16, fog: true });
  sil.toneMapped = false;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const N = 260;
  const bodies = new THREE.InstancedMesh(bodyGeo, sil, N);
  const roofs = new THREE.InstancedMesh(roofGeo, sil, N);
  const d = new THREE.Object3D();
  const win = [];
  let n = 0;
  for (let i = 0; i < N * 3 && n < N; i++) {
    const x = rr(6, 170), z = rr(-96, 372);
    if (x > 26 && x < 104 && z > -220 && z < -100) continue;      // 寄畅园
    if (x > -114 && x < -54 && z > -266 && z < -208) continue;    // 二泉院
    if (Math.abs(x - CREEK.xAt(Math.max(CREEK.zFrom, Math.min(CREEK.zTo, z)))) < CREEK.halfAt(0) + 12 && z > CREEK.zFrom && z < CREEK.zTo) continue;
    if (HILLS.hillY(x, z) > 1.5) continue;                        // 别压在山上
    const h = rr(4.2, 7.6), w = rr(6, 11), dp = rr(5, 9);
    d.position.set(x, h / 2, z);
    d.rotation.set(0, rr(-0.25, 0.25), 0);
    d.scale.set(w, h, dp);
    d.updateMatrix();
    bodies.setMatrixAt(n, d.matrix);
    d.position.set(x, h + 1.1, z);
    d.scale.set(w * 0.8, 2.6 + rand() * 1.4, dp * 0.8);
    d.updateMatrix();
    roofs.setMatrixAt(n, d.matrix);
    if (rand() > 0.62) win.push(x + rr(-w * 0.3, w * 0.3), h * rr(0.35, 0.7), z + rr(-dp * 0.3, dp * 0.3));
    n++;
  }
  bodies.count = roofs.count = n;
  bodies.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
  grp.add(bodies, roofs);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  grp.add(new THREE.Points(g, new THREE.PointsMaterial({
    map: T.softGlow('255,198,140', 0.2), size: 2.6, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true,
  })));
  scene.add(grp);
  return grp;
}

export function buildHills(scene) {
  const grp = new THREE.Group();
  grp.name = 'hills';
  const mats = [];
  HILLS.masses.forEach((m, i) => {
    const g = hillMesh(m, { seed: i * 2.3 });
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: T.stone('#8d9199'), roughness: 0.97,
      emissive: new THREE.Color('#0b1220'), emissiveIntensity: 0.45,
    });
    const hill = new THREE.Mesh(g, mat);
    hill.receiveShadow = true;
    grp.add(hill);
    mats.push(mat);
    treeLine(grp, m, i === 2 ? 150 : 330, { scale: i === 0 ? 1.1 : 0.9 });
  });
  const lampPositions = trail(grp);
  scene.add(grp);

  groundBase(scene);
  outerRidge(scene);
  const canalIsland = island(scene);
  const town = distantTown(scene);
  const suburbRoot = suburb(scene);
  const tower = buildPagoda(scene);

  // 山顶小亭：惠山脊上的两处歇山，只做轮廓
  const ridgeHuts = [];
  for (const [x, z] of [[-42, -266], [-12, -320], [-170, -296]]) {
    const y = HILLS.hillY(x, z);
    if (y < 30) continue;
    const roof = new THREE.Mesh(chineseRoofLite(5.4, 4.4, 1.9), lit('#222a3a', { rough: 0.9, emissive: '#0b1220', ei: 0.5 }));
    roof.position.set(x, y + 2.4, z);
    grp.add(roof);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), glow('#ffb06a', 1.8));
    dot.position.set(x, y + 1.6, z);
    grp.add(dot);
    ridgeHuts.push(roof);
  }

  return { group: grp, tower, town, suburb: suburbRoot, canalIsland, lampPositions, ridgeHuts };
}

/** 远处只看得清大形，屋顶用一个轻量的四坡面即可 */
function chineseRoofLite(width, depth, height) {
  const hw = width / 2, hd = depth / 2;
  const pos = [
    -hw * 1.2, 0, -hd * 1.2, hw * 1.2, 0, -hd * 1.2, 0, height, 0,
    hw * 1.2, 0, -hd * 1.2, hw * 1.2, 0, hd * 1.2, 0, height, 0,
    hw * 1.2, 0, hd * 1.2, -hw * 1.2, 0, hd * 1.2, 0, height, 0,
    -hw * 1.2, 0, hd * 1.2, -hw * 1.2, 0, -hd * 1.2, 0, height, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
