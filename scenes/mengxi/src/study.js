import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, glow, lit, M } from './kit.js';
import * as T from './textures.js';
import { GARDEN, GROUND } from './data.js';

/**
 * 书斋与门厅的室内。书斋按《梦溪笔谈》里那些条目补配：案上灯、笔砚、
 * 未誊清的稿纸、悬丝磁针、陨铁标本与一具星象仪仿制品——都是写意陈设。
 */

function woodMat() {
  return M.mxDesk || (M.mxDesk = lit('#7d5236', { map: T.wood('#5f3a24', '#331b11'), rough: 0.66 }));
}
const paper = () => M.mxPaper || (M.mxPaper = lit('#d8d2bd', { rough: 0.9, emissive: '#4a4230', ei: 0.32 }));

function desk(w = 2.4, d = 0.95, h = 0.78) {
  const parts = [];
  parts.push(box(w, 0.08, d, 0, h, 0));
  for (const sx of [-1, 1]) {
    parts.push(box(0.09, h, 0.09, sx * (w / 2 - 0.16), h / 2, -d / 2 + 0.14));
    parts.push(box(0.09, h, 0.09, sx * (w / 2 - 0.16), h / 2, d / 2 - 0.14));
    parts.push(box(0.06, 0.07, d - 0.3, sx * (w / 2 - 0.16), h * 0.28, 0));
  }
  parts.push(box(w - 0.4, 0.06, 0.06, 0, h * 0.3, 0));
  const g = mergeGeometries(parts);
  const m = new THREE.Mesh(g, woodMat());
  m.castShadow = m.receiveShadow = true;
  return m;
}

function scrollStack(x, y, z, n = 5) {
  const grp = new THREE.Group();
  const g = new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8);
  g.rotateZ(Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(g, paper());
    m.position.set(0, 0.045 + Math.floor(i / 3) * 0.085, ((i % 3) - 1) * 0.1);
    m.rotation.y = (i - 2) * 0.05;
    grp.add(m);
  }
  grp.position.set(x, y, z);
  return grp;
}

function openBook(x, y, z, rot = 0) {
  const grp = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(box(0.26, 0.012, 0.36, s * 0.13, 0, 0), paper());
    p.rotation.z = -s * 0.06;
    grp.add(p);
  }
  // 竖排的行线，纸面才不像一张空白板
  const lines = [];
  for (let i = 0; i < 9; i++) lines.push(box(0.006, 0.004, 0.26, -0.24 + i * 0.055, 0.012, 0));
  const lm = new THREE.Mesh(mergeGeometries(lines), lit('#3a3428', { rough: 0.9 }));
  grp.add(lm);
  grp.position.set(x, y, z);
  grp.rotation.y = rot;
  return grp;
}

function brushStand(x, y, z) {
  const grp = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.19, 10), lit('#2f3a44', { rough: 0.5, metal: 0.15, emissive: '#0b1116', ei: 0.5 }));
  pot.position.y = 0.095;
  grp.add(pot);
  for (let i = 0; i < 4; i++) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.26, 6), M.timberDark);
    handle.position.set(0, 0.28, 0);
    handle.rotation.set(0.1 * (i - 1.5), 0, 0.12 * (i - 1.5));
    handle.translateX((i - 1.5) * 0.02);
    grp.add(handle);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), lit('#1a1a1a', { rough: 0.8 }));
    tip.position.set((i - 1.5) * 0.035, 0.16, 0);
    grp.add(tip);
  }
  const ink = new THREE.Mesh(box(0.13, 0.05, 0.1, 0.28, 0.025, 0.02), lit('#181c22', { rough: 0.35 }));
  grp.add(ink);
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.05, 12), lit('#4a5057', { rough: 0.6 }));
  stone.position.set(0.3, 0.025, 0.2);
  grp.add(stone);
  grp.position.set(x, y, z);
  return grp;
}

/** 油灯：一盏小小的、把整间屋子染暖的光源 */
function lamp(x, y, z, { point = 12, dist = 6.5 } = {}) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.05, 12), M.gilt));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8), M.gilt);
  stem.position.y = 0.1;
  grp.add(stem);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.04, 12), M.gilt);
  dish.position.y = 0.17;
  grp.add(dish);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glow('#ffdca6', 2.6));
  flame.scale.set(0.7, 1.5, 0.7);
  flame.position.y = 0.23;
  grp.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,214,150', 0.12), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.scale.set(1.1, 1.1, 1);
  halo.position.y = 0.23;
  grp.add(halo);
  const light = new THREE.PointLight(0xffc380, point, dist, 2);
  light.position.y = 0.3;
  grp.add(light);
  grp.position.set(x, y, z);
  grp.userData.flame = flame;
  grp.userData.halo = halo;
  grp.userData.light = light;
  return grp;
}

/** 磁针：一碗水、一缕单丝、一根被磁石磨过的针 */
function compass(x, y, z) {
  const grp = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.06, 16), lit('#20262e', { rough: 0.4, metal: 0.2 }));
  bowl.position.y = 0.03;
  grp.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20), new THREE.MeshBasicMaterial({ color: 0x0d1a24, toneMapped: false }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.058;
  grp.add(water);
  const needle = new THREE.Mesh(box(0.15, 0.008, 0.012, 0, 0, 0), glow('#e8d3a8', 1.2));
  needle.position.set(0, 0.062, 0);
  grp.add(needle);
  // 地磁偏角：针不指正南，微偏东
  needle.rotation.y = -0.22;
  grp.userData.needle = needle;
  grp.position.set(x, y, z);
  return grp;
}

/** 陨铁：色如铁，重亦如之 */
function meteorite(x, y, z) {
  const grp = new THREE.Group();
  const g = new THREE.IcosahedronGeometry(0.24, 1).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.4;
    p.setXYZ(i, p.getX(i) * k * 1.15, p.getY(i) * k * 0.82, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: 0x2b2f34, roughness: 0.42, metalness: 0.85, emissive: 0x080a0d, emissiveIntensity: 0.7,
  }));
  m.castShadow = true;
  grp.add(m);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.1, 10), M.timberDark);
  stand.position.y = -0.26;
  grp.add(stand);
  grp.position.set(x, y, z);
  return grp;
}

/** 星象仪仿制品：三重环 + 窥管，架在石座上的那具样子 */
function armillary(x, y, z) {
  const grp = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a6c3a, roughness: 0.35, metalness: 0.9, emissive: 0x1a1206, emissiveIntensity: 0.8 });
  const rings = [
    [0.62, 0.03, [0, Math.PI / 2, 0]],
    [0.52, 0.028, [0.42, 0, 0]],
    [0.44, 0.026, [Math.PI / 2, 0.3, 0]],
    [0.36, 0.024, [Math.PI / 2, -0.5, 0]],
  ];
  for (const [r, t, rot] of rings) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 40), metal);
    m.rotation.set(...rot);
    m.castShadow = true;
    grp.add(m);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.0, 8), metal);
  tube.rotation.set(Math.PI / 2 - 0.5, 0, 0);
  grp.add(tube);
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 6), metal);
  grp.add(axis);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.34, 8), M.mxBrick);
  base.position.y = -0.72;
  grp.add(base);
  grp.position.set(x, y, z);
  grp.userData.spin = rings[0];
  return grp;
}

/* ------------------------------------------------------------------ 书斋室内 */
export function buildStudy(scene) {
  const s = GARDEN.study;
  const grp = new THREE.Group();
  grp.name = 'study-interior';
  const cx = (s.xFrom + s.xTo) / 2, cz = (s.zFrom + s.zTo) / 2;
  const W = s.xTo - s.xFrom, D = s.zTo - s.zFrom;
  const floorY = GROUND + 0.36;
  const ceilY = GROUND + s.eave - 0.18;

  // 地面板与内墙
  const planks = [];
  for (let x = s.xFrom; x < s.xTo; x += 0.34) {
    planks.push(box(0.3, 0.05, D - 0.2, x + 0.17, floorY + 0.025, cz));
  }
  grp.add(new THREE.Mesh(mergeGeometries(planks), woodMat()));
  const inner = [
    box(0.06, ceilY - floorY, D - 0.1, s.xFrom + 0.05, (floorY + ceilY) / 2, cz),
    box(W - 0.1, ceilY - floorY, 0.06, cx, (floorY + ceilY) / 2, s.zFrom + 0.05),
    box(W - 0.1, ceilY - floorY, 0.06, cx, (floorY + ceilY) / 2, s.zTo - 0.05),
  ];
  grp.add(new THREE.Mesh(mergeGeometries(inner), lit('#b8b3a2', { rough: 0.95, side: THREE.DoubleSide, emissive: '#2a2620', ei: 0.35 })));

  // 梁与柱
  const beams = [];
  for (const z of [s.zFrom + 1.2, cz, s.zTo - 1.2]) {
    beams.push(box(W - 0.3, 0.22, 0.2, cx, ceilY - 0.14, z));
  }
  beams.push(box(0.24, 0.26, D - 0.3, s.xFrom + 1.0, ceilY - 0.4, cz));
  grp.add(new THREE.Mesh(mergeGeometries(beams), M.timberDark));
  // 顶棚：不加这一层，从屋里抬头就是瓦片的背面
  const ceil = new THREE.Mesh(box(W - 0.2, 0.08, D - 0.2, cx, ceilY + 0.04, cz), M.timberDark);
  grp.add(ceil);

  // 案：靠西墙，面朝东窗
  const d1 = desk(2.5, 1.0, 0.78);
  d1.position.set(s.xFrom + 2.5, floorY, cz - 0.6);
  grp.add(d1);
  grp.add(lamp(s.xFrom + 2.2, floorY + 0.82, cz - 0.9, { point: 14, dist: 7.5 }));
  grp.add(brushStand(s.xFrom + 3.1, floorY + 0.82, cz - 0.55));
  grp.add(openBook(s.xFrom + 2.6, floorY + 0.83, cz - 0.25, 0.12));
  grp.add(openBook(s.xFrom + 3.3, floorY + 0.83, cz - 0.95, -0.2));
  grp.add(scrollStack(s.xFrom + 3.6, floorY + 0.82, cz - 0.3, 6));
  grp.add(compass(s.xFrom + 1.9, floorY + 0.83, cz - 0.3));

  // 坐席与踏几
  const seat = new THREE.Mesh(box(0.72, 0.42, 0.6, s.xFrom + 2.4, floorY + 0.23, cz + 0.75), woodMat());
  grp.add(seat);
  grp.add(new THREE.Mesh(box(0.66, 0.08, 0.54, s.xFrom + 2.4, floorY + 0.47, cz + 0.75), lit('#6a4d5c', { rough: 0.9 })));

  // 陈列：陨铁与星象仪（照今存展陈的样子补配）
  const shelfY = floorY + 0.9;
  const case1 = new THREE.Mesh(box(2.2, 0.1, 0.7, 0, 0, 0), woodMat());
  case1.position.set(s.xFrom + 2.6, shelfY, s.zTo - 0.75);
  grp.add(case1);
  for (const sx of [-1, 1]) {
    grp.add(new THREE.Mesh(box(0.08, 0.9, 0.6, s.xFrom + 2.6 + sx * 0.9, shelfY - 0.45, s.zTo - 0.75), M.timberDark));
  }
  grp.add(meteorite(s.xFrom + 2.1, shelfY + 0.26, s.zTo - 0.75));
  const arm = armillary(0, 0, 0);
  arm.scale.setScalar(0.62);
  arm.position.set(s.xFrom + 3.3, shelfY + 0.62, s.zTo - 0.75);
  grp.add(arm);

  // 立一具较大的浑仪在星台上（屋外）
  const sky = armillary(GARDEN.starPlatform.x, GROUND + 0.7 + 0.9, GARDEN.starPlatform.z);
  sky.scale.setScalar(1.15);
  grp.add(sky);

  // 沈括像：案后一人，夜里还在写
  const figure = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.92, 9), lit('#2c3348', { rough: 0.92, emissive: '#0b1018', ei: 0.5 }));
  robe.position.y = 0.46;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lit('#c8b49a', { rough: 0.8 }));
  head.position.y = 1.06;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 10), lit('#1a1e28', { rough: 0.8 }));
  cap.position.y = 1.18;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.5, 6), lit('#2c3348', { rough: 0.9 }));
  armR.rotation.z = 1.1;
  armR.position.set(0.26, 0.72, 0.16);
  figure.add(robe, head, cap, armR);
  figure.position.set(s.xFrom + 2.5, floorY + 0.4, cz + 0.78);
  figure.rotation.y = Math.PI / 2 + 0.15;
  figure.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  grp.add(figure);

  scene.add(grp);
  const lamps = [];
  grp.traverse((o) => { if (o.userData?.flame) lamps.push(o); });
  return {
    group: grp,
    lamps,
    armillary: sky,
    figure,
    update(t) {
      // 灯焰与光晕一起呼吸，磁针缓缓找回它那个偏角
      for (const l of lamps) {
        const f = 0.86 + 0.14 * Math.sin(t * 7.3 + l.position.x * 3) + 0.05 * Math.sin(t * 19.7);
        l.userData.flame.scale.set(0.7 * f, 1.5 * f, 0.7 * f);
        l.userData.halo.scale.set(1.1 * f, 1.1 * f, 1);
        l.userData.light.intensity = (9 + 5 * Math.min(1, f)) * (0.9 + 0.1 * Math.sin(t * 3.1));
      }
      grp.traverse((o) => { if (o.userData?.needle) o.userData.needle.rotation.y += (0.06 - o.userData.needle.rotation.y) * 0.004; });
      if (sky) sky.rotation.y = t * 0.035;
    },
  };
}

/* ------------------------------------------------------------------ 门厅室内 */
export function buildHall(scene) {
  const h = { cx: -12.6, cz: 0, widthZ: 11.6, depthX: 6.6, eave: 3.5 };
  const grp = new THREE.Group();
  grp.name = 'hall-interior';
  const floorY = GROUND + 0.36;
  const eaveY = GROUND + h.eave;
  const xIn = h.cx - h.depthX / 2, xOut = h.cx + h.depthX / 2;
  const zA = h.cz - h.widthZ / 2, zB = h.cz + h.widthZ / 2;

  const planks = [];
  for (let z = zA; z < zB; z += 0.34) planks.push(box(h.depthX - 0.2, 0.05, 0.3, h.cx, floorY + 0.025, z + 0.15));
  grp.add(new THREE.Mesh(mergeGeometries(planks), woodMat()));

  // 内墙抹灰
  const inner = [
    box(h.depthX - 0.2, eaveY - floorY - 0.2, 0.06, h.cx, (floorY + eaveY) / 2, zA + 0.05),
  ];
  grp.add(new THREE.Mesh(mergeGeometries(inner), lit('#bdb7a6', { rough: 0.95, side: THREE.DoubleSide, emissive: '#241f19', ei: 0.4 })));

  // 柱
  for (const z of [h.cz - 3.6, h.cz, h.cz + 3.6]) {
    for (const x of [xIn + 0.5, xOut - 0.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, eaveY - floorY - 0.1, 10), M.redTimber);
      p.position.set(x, (floorY + eaveY) / 2, z);
      p.castShadow = true;
      grp.add(p);
    }
  }
  grp.add(new THREE.Mesh(box(h.depthX - 0.2, 0.08, h.widthZ - 0.2, h.cx, eaveY - 0.16, h.cz), M.timberDark));

  // 塑像与碑：展厅的样子
  const plinth = new THREE.Mesh(box(1.1, 0.62, 0.8, 0, 0.31, 0), M.mxBrick);
  plinth.position.set(h.cx + 0.4, floorY, h.cz);
  grp.add(plinth);
  const statue = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 1.3, 10), lit('#3a4257', { rough: 0.9 }));
  robe.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), lit('#c9b69c', { rough: 0.8 }));
  head.position.y = 1.44;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 10), lit('#1b1f29', { rough: 0.8 }));
  cap.position.y = 1.6;
  statue.add(robe, head, cap);
  statue.position.set(h.cx + 0.4, floorY + 0.62, h.cz);
  statue.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  grp.add(statue);

  // 展柜两具，玻璃后面透一点冷光
  for (const [dz, kind] of [[-2.6, 'case'], [2.6, 'case']]) {
    const cab = new THREE.Group();
    cab.add(new THREE.Mesh(box(1.0, 0.86, 0.7, 0, 0.43, 0), M.timberDark));
    const glowPane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), glow(kind === 'case' ? '#cfe6d8' : '#e0d6c0', 0.5));
    glowPane.position.set(0, 0.5, 0.36);
    cab.add(glowPane);
    const small = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1).toNonIndexed(), lit('#59606a', { rough: 0.5, metal: 0.5 }));
    small.position.set(0, 0.95, 0);
    cab.add(small);
    cab.position.set(h.cx - 1.4, floorY, h.cz + dz);
    cab.rotation.y = -Math.PI / 2;
    grp.add(cab);
  }

  // 门厅里的两盏吊灯
  for (const dz of [-2.9, 2.9]) {
    grp.add(lamp(h.cx, floorY + 1.9, h.cz + dz, { point: 9, dist: 6 }));
  }

  scene.add(grp);
  return { group: grp };
}
