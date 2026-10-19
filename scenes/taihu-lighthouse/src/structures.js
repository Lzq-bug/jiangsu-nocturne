import * as THREE from 'three';
import { GEO } from './data.js';
import { M, PAL, glow, mesh, box, chineseRoof, ridgeOrnament, pillarGeo, railingGeo, rr } from './kit.js';
import { elev } from './terrain.js';
import * as T from './textures.js';

/**
 * 石咀上的人造光层：长春桥、游船码头与七桅帆船、赏樱楼、涵虚亭，
 * 以及湖对岸的太湖仙岛。夜景里这些才是亮部，地形只是它们的底座。
 */

const clamp = THREE.MathUtils.clamp;

/* ------------------------------------------------------------------ 长春桥 */

/** 高拱单孔石桥（仿玉带桥式）：拱脚从水里起，桥面走一条圆弧背 */
function archBridge(columns) {
  const { x: BX, z: BZ, dir, span } = GEO.bridge;
  const rise = 6.4;
  const half = span / 2;
  const R = (half * half + rise * rise) / (2 * rise);   // 桥面弧线所在圆的半径
  const cy = -R + rise;                                  // 圆心（桥面最高点在 y=0 处）
  const deckAt = (x) => Math.sqrt(Math.max(0, R * R - x * x)) + cy;
  const grp = new THREE.Group();

  const W = 5.2;                                         // 桥宽
  const base = -3.0;                                     // 拱脚埋进水里
  const shape = new THREE.Shape();
  shape.moveTo(-half, base);
  for (let i = 0; i <= 30; i++) {
    const x = -half + (span * i) / 30;
    shape.lineTo(x, deckAt(x));
  }
  shape.lineTo(half, base);
  shape.lineTo(-half, base);
  // 拱洞：桥面以下、以 R-1.4 为半径的同圆心弧
  const hole = new THREE.Path();
  const ri = R - 1.5;
  hole.moveTo(-half + 0.6, base);
  for (let i = 30; i >= 0; i--) {
    const x = -half + 0.6 + ((span - 1.2) * i) / 30;
    const y = Math.sqrt(Math.max(0, ri * ri - x * x)) + cy;
    hole.lineTo(x, Math.min(y, deckAt(x) - 0.1));
  }
  hole.lineTo(-half + 0.6, base);
  shape.holes.push(hole);

  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 24 }),
    M.stoneDressed,
  );
  body.position.z = -W / 2;
  body.castShadow = body.receiveShadow = true;
  grp.add(body);

  // 栏杆随桥面起伏：逐段摆立柱与扶手
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const x = -half + (span * i) / n;
    const y = deckAt(x);
    for (const s of [-1, 1]) {
      const post = mesh([box(0.15, 0.95, 0.15, 0, 0.48, 0)], M.stoneDressed);
      post.position.set(x, y, s * (W / 2 - 0.22));
      grp.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), M.stoneDressed);
      cap.position.set(x, y + 1.0, s * (W / 2 - 0.22));
      grp.add(cap);
      if (i < n) {
        const x2 = -half + (span * (i + 1)) / n;
        const y2 = deckAt(x2);
        const len = Math.hypot(x2 - x, y2 - y);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.1, 0.2), M.stone);
        rail.position.set((x + x2) / 2, (y + y2) / 2 + 0.92, s * (W / 2 - 0.22));
        rail.rotation.z = Math.atan2(y2 - y, x2 - x);
        grp.add(rail);
      }
    }
  }

  // 两端的桥灯：石灯柱 + 暖光
  for (const s of [-1, 1]) {
    const x = s * (half + 1.6);
    const y = deckAt(clamp(x, -half, half)) - 0.2;
    const pole = mesh([
      box(0.5, 0.4, 0.5, 0, 0.2, 0),
      new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8).translate(0, 1.5, 0),
      box(0.62, 0.5, 0.62, 0, 2.85, 0),
    ], M.stone);
    pole.position.set(x, y, 0);
    grp.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), glow(PAL.lampGlow, 2.6));
    head.position.set(x, y + 2.85, 0);
    grp.add(head);
    const l = new THREE.PointLight(0xffb96a, 60, 46, 2);
    l.position.set(x, y + 2.9, 0);
    grp.add(l);
    columns.add(new THREE.Vector3(BX + x * Math.cos(dir), 0, BZ + x * Math.sin(dir)), PAL.lampWarm, 1.3, 15, 1);
  }

  grp.position.set(BX, elev(BX, BZ) - 1.2, BZ);
  grp.rotation.y = -dir + Math.PI / 2;
  return grp;
}

/* ------------------------------------------------------------------ 码头与船 */

/** 石砌驳岸上的栈桥：顺坡下到水面，尽头泊船 */
function pier(columns) {
  const { x: PX, z: PZ, deckY } = GEO.pier;
  const grp = new THREE.Group();
  // 朝西南的湖面上架一条桥：从平台沿 (-x,+z) 方向下坡到水边
  const ax = -0.72, az = 0.69;                     // 陆上一侧的方向
  const steps = 16;
  const len = 46;
  const yTop = deckY, yEnd = 0.7;
  const deckParts = [], postParts = [];
  const ease = (t) => t * t * (3 - 2 * t);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const x0 = PX + ax * len * t0, z0 = PZ + az * len * t0;
    const x1 = PX + ax * len * t1, z1 = PZ + az * len * t1;
    const y0 = yTop + (yEnd - yTop) * ease(t0);
    const y1 = yTop + (yEnd - yTop) * ease(t1);
    const dx = x1 - x0, dz = z1 - z0;
    const segLen = Math.hypot(dx, dz);
    // 局部 +X 要对齐这一档的走向，否则斜着的栈桥会拼成锯齿
    const phi = Math.atan2(-dz, dx);
    const put = (g, lx, lz, ly) => {
      g.rotateY(phi);
      g.translate(x0 + dx / 2 + lx, (y0 + y1) / 2 + ly, z0 + dz / 2 + lz);
      return g;
    };
    deckParts.push(put(new THREE.BoxGeometry(segLen + 0.3, 0.34, 6.4), 0, 0, 0));
    for (const s of [-1, 1]) {
      const off = s * 3.0;
      deckParts.push(put(new THREE.BoxGeometry(segLen + 0.3, 0.09, 0.09), 0, off, 1.05));
      // 立柱不随桥向转，直接按世界坐标摆
      postParts.push(box(0.22, 1.2, 0.22, x1 + (dz / segLen) * off, y1 + 0.5, z1 - (dx / segLen) * off));
    }
  }
  const deck = mesh(deckParts, M.deck);
  deck.receiveShadow = true;
  grp.add(deck, mesh(postParts, M.ink));

  // 桥灯：沿栈桥一侧每三档一盏，倒影交给 LightColumns
  for (let i = 1; i < steps; i += 3) {
    const t = i / steps;
    const x = PX + ax * len * t, z = PZ + az * len * t;
    const y = yTop + (yEnd - yTop) * t * t * (3 - 2 * t);
    const pole = mesh([
      box(0.12, 1.9, 0.12, 0, 0.95, 0),
      box(0.34, 0.3, 0.34, 0, 2.0, 0),
    ], M.iron);
    pole.position.set(x - az * 3.0, y + 0.2, z + ax * 3.0);
    grp.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 9, 7), glow(PAL.lampGlow, 2.8));
    head.position.set(x - az * 3.0, y + 2.16, z + ax * 3.0);
    grp.add(head);
    columns.add(new THREE.Vector3(x - az * 3.0, 0, z + ax * 3.0), PAL.lampWarm, 1.0, 11, 0.9);
  }
  return grp;
}

/** 七桅帆船（复原展示船）：夜里泊在码头，只点几盏舱灯 */
function junkBoat(columns) {
  const { x: PX, z: PZ } = GEO.pier;
  // 泊在栈桥尽头外侧的湖面上，与桥身平行（桥从 -60,150 走到 -93,182）
  const bx = -97, bz = 175;
  const grp = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 2.2, 15, 10, 1),
    M.beam,
  );
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(0.62, 1, 1);
  hull.position.y = 0.4;
  grp.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5.2, 10), M.beam);
  bow.rotation.z = -Math.PI / 2;
  bow.position.set(9.4, 0.6, 0);
  grp.add(bow);
  const stern = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 5.2), M.beam);
  stern.position.set(-7.6, 1.9, 0);
  grp.add(stern);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.2, 4.2), M.deck);
  cabin.position.set(-2.6, 3.0, 0);
  grp.add(cabin);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), glow(PAL.lampGlow, 2.2));
  win.position.set(-2.0, 3.0, 2.15);
  grp.add(win);

  // 七根桅：前后收分，夜里帆是落下的，只留横桁
  const mastGeo = (h) => new THREE.CylinderGeometry(0.13, 0.22, h, 7);
  const heights = [15, 17.5, 19, 20, 17, 14, 11];
  heights.forEach((h, i) => {
    const mx = -6 + i * 2.4;
    const mast = new THREE.Mesh(mastGeo(h), M.beam);
    mast.position.set(mx, 1.6 + h / 2, 0);
    mast.rotation.z = -0.05;
    grp.add(mast);
    for (const fy of [0.42, 0.72]) {
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.2 * (1 - fy * 0.4), 6), M.beam);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(mx, 1.6 + h * fy, 0);
      grp.add(yard);
    }
  });
  // 缆绳与帆索：一组线段，剪影就靠它
  const lines = [];
  for (let i = 0; i < 7; i++) {
    const mx = -6 + i * 2.4, h = heights[i];
    lines.push(mx, 1.6 + h * 0.95, 0, mx + 5.4, 2.2, 0);
    lines.push(mx, 1.6 + h * 0.6, 0, mx - 5.0, 2.2, 0);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2f3a, fog: true })));

  grp.position.set(bx, 0.1, bz);
  grp.rotation.y = Math.atan2(0.69, -0.72) + Math.PI / 2;
  const lamp = new THREE.PointLight(0xffb96a, 40, 40, 2);
  lamp.position.set(bx, 4.4, bz);
  grp.add(lamp);
  columns.add(new THREE.Vector3(bx, 0, bz), PAL.lampWarm, 1.6, 13, 0.8);
  return { group: grp, pos: new THREE.Vector3(bx, 0, bz) };
}

/* ------------------------------------------------------------------ 楼阁 */

/** 重檐楼阁：赏樱楼 / 涵虚亭共用一套做法 */
function tower({ w, d, tiers, tierH, roofH, bodyMat, roofMat, lanterns = 0, name = 'pavilion' }) {
  const grp = new THREE.Group();
  grp.name = name;
  let y = 0;
  for (let t = 0; t < tiers; t++) {
    const sc = 1 - t * 0.18;
    const bw = w * sc, bd = d * sc;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, tierH, bd * 0.9), bodyMat);
    body.position.y = y + tierH / 2;
    body.castShadow = true;
    grp.add(body);
    // 檐柱
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Mesh(pillarGeo(tierH, 0.17), M.pillar);
      p.position.set(sx * bw * 0.44, y, sz * bd * 0.44);
      grp.add(p);
    }
    const roof = new THREE.Mesh(chineseRoof({
      width: bw, depth: bd, height: roofH, ridgeRatio: 0.4, overhang: bw * 0.16,
    }), roofMat);
    roof.position.y = y + tierH;
    roof.castShadow = true;
    grp.add(roof);
    const crest = mesh(ridgeOrnament({
      width: bw * 0.9, depth: bd * 0.9, height: roofH, overhang: bw * 0.1,
    }), M.ridge);
    crest.position.y = y + tierH;
    grp.add(crest);
    y += tierH + roofH * 0.55;
  }
  // 檐下灯：每层四角挂一盏
  for (let i = 0; i < lanterns; i++) {
    const a = (i / lanterns) * Math.PI * 2;
    const t = Math.floor((i / lanterns) * tiers);
    const sc = 1 - t * 0.18;
    const lx = Math.cos(a) * w * sc * 0.46, lz = Math.sin(a) * d * sc * 0.46;
    const ly = t * (tierH + roofH * 0.55) + tierH * 0.75;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), glow(PAL.lanternWarm, 2.4));
    lamp.position.set(lx, ly, lz);
    grp.add(lamp);
  }
  return grp;
}

/** 赏樱楼：樱花谷高处的对景，夜里整栋亮着 */
function cherryTower(columns) {
  const { x, z, y } = GEO.pavilion;
  const g = tower({
    w: 13, d: 13, tiers: 3, tierH: 4.2, roofH: 2.6,
    bodyMat: M.wall, roofMat: M.roof, lanterns: 10, name: '赏樱楼',
  });
  g.position.set(x, y - 0.6, z);
  g.rotation.y = 0.5;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 1.6, 8), M.stoneDressed);
  plinth.position.set(x, y - 1.4, z);
  const grp = new THREE.Group();
  grp.add(plinth, g);
  const l = new THREE.PointLight(0xffc07a, 260, 130, 2);
  l.position.set(x, y + 9, z);
  grp.add(l);
  columns.add(new THREE.Vector3(x, 0, z), PAL.lampWarm, 4.2, 26, 0.9);
  return grp;
}

/** 涵虚亭：灯塔前的一方小亭，剪影压住台地边缘 */
function hanxuPavilion(columns) {
  const { x, z } = GEO.hanxu;
  const g = tower({
    w: 6.4, d: 6.4, tiers: 1, tierH: 3.0, roofH: 2.0,
    bodyMat: M.stone, roofMat: M.roof, lanterns: 4, name: '涵虚亭',
  });
  const y = elev(x, z);
  g.position.set(x, y, z);
  g.rotation.y = 0.3;
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.6, 0.5, 8), M.stoneDressed);
  floor.position.set(x, y - 0.2, z);
  const rail = new THREE.Mesh(railingGeo(12, { height: 0.9, spacing: 1.5 }), M.stoneDressed);
  rail.position.set(x, y, z + 4.2);
  const lamp = new THREE.PointLight(0xffcf94, 70, 46, 2);
  lamp.position.set(x, y + 3.4, z);
  const grp = new THREE.Group();
  grp.add(floor, g, rail, lamp);
  columns.add(new THREE.Vector3(x, 0, z), PAL.lampWarm, 1.6, 14, 0.8);
  return grp;
}

/* ------------------------------------------------------------------ 太湖仙岛 */

/**
 * 西南 1 公里外（实距 2.6 公里，为构图压缩过）的湖中岛。
 * 距离这么远，岛只需要三件事：一条压住水面的黑脊、一串勾轮廓的灯、
 * 以及灯下面那一层模糊的暖光。
 */
function distantIsland(columns) {
  const { x: IX, z: IZ, a, b } = GEO.island;
  const grp = new THREE.Group();
  grp.name = '太湖仙岛';

  // 岛脊：两层错落的丘
  const ridge = (w, h, ox, oz, mat) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.position.set(IX + ox, -6, IZ + oz);
    m.scale.set(w, h, w * 0.66);
    return m;
  };
  const dark = new THREE.MeshBasicMaterial({ color: 0x060a12, fog: true });
  dark.toneMapped = false;
  grp.add(ridge(a * 0.55, 34, -a * 0.3, b * 0.1, dark));
  grp.add(ridge(a * 0.45, 26, a * 0.3, -b * 0.15, dark));
  grp.add(ridge(a * 0.3, 18, a * 0.1, b * 0.35, dark));

  // 天街与楼阁的灯：沿岛脊撒一串，越密越像有人住
  const pts = [];
  const glowTex = T.softGlow('255,206,150', 0.18);
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const ox = -a * 0.72 + t * a * 1.5;
    const oz = Math.sin(t * 3.1) * b * 0.22;
    const oy = 6 + Math.sin(t * Math.PI) * 16 + rr(-2, 4);
    pts.push([ox, oy, oz, 0.55 + Math.random() * 0.5]);
  }
  // 灵霄宫那一组最亮，压在岛的最高处
  pts.push([a * 0.1, 30, 0, 1.6], [a * 0.16, 36, -6, 1.2], [a * 0.02, 26, 8, 1.1]);
  for (const [ox, oy, oz, s] of pts) {
    const m = new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    m.toneMapped = false;
    const sp = new THREE.Sprite(m);
    sp.position.set(IX + ox, oy, IZ + oz);
    const k = 26 * s;
    sp.scale.set(k, k, 1);
    grp.add(sp);
  }
  // 会仙桥：一小段横在水面上的灯线
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(a * 0.5, 0.6, 2.2), dark);
  bridge.position.set(IX + a * 0.62, 1.5, IZ + b * 0.3);
  bridge.rotation.y = 0.5;
  grp.add(bridge);
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const m = new THREE.SpriteMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    m.toneMapped = false;
    const sp = new THREE.Sprite(m);
    sp.position.set(IX + a * 0.62 + t * a * 0.5, 3.2, IZ + b * 0.3 + t * 1.2);
    sp.scale.set(11, 11, 1);
    grp.add(sp);
  }
  columns.add(new THREE.Vector3(IX, 0, IZ), PAL.lampWarm, 26, 30, 0.5);
  return grp;
}

/* ------------------------------------------------------------------ assemble */

export function buildStructures(scene, columns) {
  const grp = new THREE.Group();
  grp.name = 'structures';
  const boat = junkBoat(columns);
  grp.add(archBridge(columns), pier(columns), boat.group, cherryTower(columns), hanxuPavilion(columns), distantIsland(columns));
  scene.add(grp);
  return { group: grp, boat };
}
