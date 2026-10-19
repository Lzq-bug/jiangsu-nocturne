import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chineseRoof, box, glow, rand, rr, pillarGeo, railingGeo, registerOccluder } from './kit.js';
import * as T from './textures.js';
import { SITE, KEY, lanePoint, laneHW, yawAt } from './plan.js';

/**
 * 院落与宅园：门厅—天井—厅堂一路纵深，园子在最后进之后。
 * 「五进四开间」是这一带大宅的通行说法【可考】，具体进深、间数、
 * 假山与亭廊的位置都按画意重排，非原状、非测绘。
 */

const join = (parts, mat, cast = true) => {
  const m = new THREE.Mesh(mergeGeometries(parts.filter(Boolean)), mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
};

const MAT = () => ({
  wall: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c4baa6'), map: T.plaster('#b0a58e'), roughness: 0.95,
    emissive: new THREE.Color('#151a26'), emissiveIntensity: 0.11,
  }),
  brick: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8b8578'), map: T.stone('#6f6a5d'), roughness: 0.94,
    emissive: new THREE.Color('#12161f'), emissiveIntensity: 0.09,
  }),
  stone: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7f8694'), map: T.stone('#6d7482'), roughness: 0.88,
  }),
  tile: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#bfc7da'), map: T.roofTiles('#323b52', '#47516b', '#70809e'),
    roughness: 0.78, side: THREE.DoubleSide, emissive: new THREE.Color('#111a2a'), emissiveIntensity: 0.14,
  }),
  wood: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5a3626'), map: T.wood('#4a2b1e', '#2a1710'), roughness: 0.75,
  }),
  rock: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4f4e47'), roughness: 0.98, flatShading: true,
    emissive: new THREE.Color('#151a1e'), emissiveIntensity: 0.12,
  }),
  leaf: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#23332c'), roughness: 0.95, flatShading: true,
    emissive: new THREE.Color('#0e1614'), emissiveIntensity: 0.15,
  }),
  lattice: new THREE.MeshBasicMaterial({ map: T.lattice(), color: 0xa08564, toneMapped: false, side: THREE.DoubleSide }),
});

/** 一段院墙：压顶瓦 + 勒脚，可开窗洞 */
function yardWall(from, to, h, mats, holes = 0) {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const yaw = Math.atan2(from.z - to.z, to.x - from.x);
  const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
  const g = new THREE.Group();
  const body = [];
  const cap = [];
  const plinth = [];
  if (holes > 0) {
    // 开几个漏窗：墙身分段留出窗洞
    const seg = len / (holes * 2 + 1);
    for (let i = 0; i < holes * 2 + 1; i++) {
      if (i % 2 === 0) {
        const cx = -len / 2 + seg * (i + 0.5);
        body.push(box(seg, h - 1.5, 0.32, cx, (h - 1.5) / 2 + 0.4, 0));
        body.push(box(seg, 0.55, 0.32, cx, h - 0.28, 0));
      }
      plinth.push(box(seg + 0.04, 0.44, 0.46, -len / 2 + seg * (i + 0.5), 0.22, 0));
      cap.push(box(seg + 0.1, 0.18, 0.6, -len / 2 + seg * (i + 0.5), h + 0.1, 0));
    }
  } else {
    body.push(box(len, h, 0.32, 0, h / 2 + 0.3, 0));
    plinth.push(box(len + 0.06, 0.44, 0.48, 0, 0.22, 0));
    cap.push(box(len + 0.24, 0.2, 0.62, 0, h + 0.4, 0));
  }
  g.add(join(body, mats.wall));
  g.add(join(plinth, mats.stone, false));
  g.add(join(cap, mats.tile, false));
  g.position.set(mx, 0, mz);
  g.rotation.y = yaw;
  // 漏窗的棂条
  if (holes > 0) {
    const seg = len / (holes * 2 + 1);
    for (let i = 0; i < holes; i++) {
      const cx = -len / 2 + seg * (2 * i + 1.5);
      const lat = new THREE.Mesh(new THREE.PlaneGeometry(seg * 0.86, 1.0), mats.lattice);
      lat.position.set(cx, h * 0.52, 0.02);
      g.add(lat);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,175,100', 0.14), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false, opacity: 0.55,
      }));
      halo.material.toneMapped = false;
      halo.position.set(cx, h * 0.52, 0.1);
      halo.scale.setScalar(1.9);
      g.add(halo);
    }
  }
  return g;
}

/** 一间房子：屋身 + 硬山屋顶 + 檐柱 */
function hall({ w, d, h = 3.6, rh = 1.7, mats, posts = 4, name = '' }) {
  const g = new THREE.Group();
  g.add(join([box(w, h, d, 0, h / 2, 0)], mats.wall));
  const roof = chineseRoof({ width: w, depth: d, height: rh, ridgeRatio: 0.46, curve: 0.56, eaveLift: 0.34, overhang: 0.55, hip: false, segU: 16, segV: 12 });
  roof.translate(0, h, 0);
  g.add(join([roof], mats.tile));
  const gable = (s) => {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0); shape.lineTo(-d / 2, h); shape.lineTo(0, h + rh); shape.lineTo(d / 2, h); shape.lineTo(d / 2, 0); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(s * (w / 2 - 0.15), 0, 0);
    return geo;
  };
  g.add(join([gable(-1), gable(1)], mats.wall));
  // 檐柱与廊
  const cols = [];
  for (let i = 0; i < posts; i++) {
    const x = -w / 2 + w * (i + 0.5) / posts;
    cols.push(pillarGeo(h - 0.2, 0.17));
    cols[cols.length - 1].translate(x, 0, d / 2 + 0.9);
  }
  g.add(join(cols, mats.wood));
  g.add(join([box(w + 1.2, 0.2, 1.1, 0, h - 0.1, d / 2 + 0.95)], mats.wood));
  // 明间一组落地长窗，把空墙变成可看的门面
  const leaves = Math.max(3, Math.round(w / 1.5));
  const panels = [];
  for (let i = 0; i < leaves; i++) {
    const x = -w / 2 + w * (i + 0.5) / leaves;
    panels.push(box(w / leaves - 0.12, h * 0.62, 0.1, x, h * 0.33, d / 2 + 0.06));
  }
  g.add(join(panels, mats.wood, false));
  for (let i = 0; i < leaves; i++) {
    const x = -w / 2 + w * (i + 0.5) / leaves;
    const lat = new THREE.Mesh(new THREE.PlaneGeometry(w / leaves - 0.26, h * 0.56), mats.lattice);
    lat.position.set(x, h * 0.33, d / 2 + 0.13);
    g.add(lat);
  }
  if (name) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.78),
      new THREE.MeshBasicMaterial({ map: T.plaque(name, { dir: 'h', bg: '#22141a', fg: '#f0dcb4', border: '#c9974f' }), toneMapped: false }));
    plate.position.set(0, h - 0.7, d / 2 + 1.22);
    g.add(plate);
    const wash = new THREE.SpotLight(new THREE.Color('#ffd9a4'), 12, 9, 0.7, 0.55, 1.6);
    wash.position.set(0, h - 2.4, d / 2 + 2.6);
    wash.target.position.set(0, h - 0.7, d / 2 + 1.2);
    g.add(wash, wash.target);
  }
  return g;
}

/** 天井：石板 + 阶沿石 + 一两株牡丹或石榴 */
function court({ cx, cz, w, d, mats, peony = false, name = '' }) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  const slabs = [];
  const n = Math.max(3, Math.round(w / 1.4));
  const m = Math.max(3, Math.round(d / 1.4));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      slabs.push(box(w / n - 0.08, 0.09, d / m - 0.08, -w / 2 + w * (i + 0.5) / n, 0.045, -d / 2 + d * (j + 0.5) / m));
    }
  }
  g.add(join(slabs, new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9aa1b0'), map: T.stone('#8b929f'), roughness: 0.5, metalness: 0.08,
    emissive: new THREE.Color('#111a2b'), emissiveIntensity: 0.13,
  }), false));
  // 阶沿石
  g.add(join([box(w + 0.6, 0.22, 0.5, 0, 0.11, -d / 2 - 0.2), box(w + 0.6, 0.22, 0.5, 0, 0.11, d / 2 + 0.2)], mats.stone, false));
  if (peony) {
    // 福寿堂的百年牡丹：夜里只剩一团叶影，靠一盏侧光把它打亮
    for (let i = 0; i < 5; i++) {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.42, 0.7), 1), mats.leaf);
      bush.position.set(rr(-w * 0.3, w * 0.3), 0.5, rr(-d * 0.25, d * 0.25));
      bush.castShadow = true;
      g.add(bush);
    }
    for (let i = 0; i < 6; i++) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow('#ffd0dc', 0.9));
      bloom.position.set(rr(-1.4, 1.4), rr(0.75, 1.15), rr(-1.1, 1.1));
      g.add(bloom);
    }
    const spot = new THREE.SpotLight(new THREE.Color('#ffe2c0'), 9, 11, 0.66, 0.6, 1.5);
    spot.position.set(w * 0.4, 3.2, d * 0.4);
    spot.target.position.set(0, 0.6, 0);
    g.add(spot, spot.target);
  }
  return g;
}

/** 一座亭：四柱或六柱，攒尖顶 */
function pavilion({ r = 1.7, h = 2.9, sides = 4, mats }) {
  const g = new THREE.Group();
  const cols = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / 4;
    const c = pillarGeo(h, 0.14);
    c.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    cols.push(c);
  }
  g.add(join(cols, mats.wood));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.75, 1.5, sides === 4 ? 4 : 6, 1, false), mats.tile);
  roof.position.y = h + 0.6;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), glow('#ffdca6', 1.6));
  cap.position.y = h + 1.4;
  g.add(cap);
  const lam = new THREE.PointLight(new THREE.Color('#ffb872'), 4.4, 11, 2.2);
  lam.position.set(0, h - 0.5, 0);
  g.add(lam);
  return g;
}

/** 曲廊：一段段立柱加披水檐 */
function corridor({ from, to, mats, step = 2.4 }) {
  const g = new THREE.Group();
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const n = Math.max(2, Math.round(len / step));
  const yaw = Math.atan2(from.z - to.z, to.x - from.x);
  const parts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -len / 2 + len * t;
    const c = pillarGeo(2.7, 0.13);
    c.translate(x, 0, 0.55);
    parts.push(c);
    const c2 = pillarGeo(2.7, 0.13);
    c2.translate(x, 0, -0.55);
    parts.push(c2);
  }
  g.add(join(parts, mats.wood, false));
  g.add(join([box(len + 0.5, 0.16, 1.9, 0, 2.85, 0.35)], mats.tile));
  g.add(join([box(len + 0.3, 0.2, 1.7, 0, 0.1, 0.35)], mats.stone, false));
  const rail = railingGeo(len, { height: 0.85, spacing: 1.1 });
  rail.translate(0, 0.2, -0.5);
  g.add(join([rail], mats.wood, false));
  g.position.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
  g.rotation.y = yaw;
  return g;
}

/** 黄石假山：先立锥形山骨，再把扁石贴到表面上，才叠得出山而不是一堆散石 */
function rockery({ cx, cz, spread, peak, mats }) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  const flat = spread[1] / spread[0];
  const base = spread[0] * 0.52;
  const core = new THREE.Mesh(new THREE.ConeGeometry(base, peak * 1.04, 10, 3), mats.rock);
  core.position.y = peak * 0.52;
  core.scale.z = flat;
  core.rotation.y = 0.4;
  g.add(core);

  const parts = [];
  for (let i = 0; i < 40; i++) {
    const t = rand();
    const y = peak * 0.12 + t * peak * 0.9;
    const shell = base * (1 - (y / (peak * 1.04)) * 0.9) * rr(0.86, 1.22);
    const a = rand() * Math.PI * 2;
    const size = rr(0.5, 1.0) * (1 - t * 0.3);
    const b = new THREE.DodecahedronGeometry(size, 0);
    b.scale(1, 0.66, 0.86);
    b.rotateX(rand() * 3);
    b.rotateY(rand() * 3);
    b.translate(Math.cos(a) * shell, y, Math.sin(a) * shell * flat);
    parts.push(b);
  }
  // 山脚的蹬道：一圈横石，往上退着收
  for (let i = 0; i < 7; i++) {
    const a = 0.7 + i * 0.24;
    const r = base * (1.06 - i * 0.09);
    const step = box(1.15, 0.24, 0.52, Math.cos(a) * r, 0.16 + i * 0.42, Math.sin(a) * r * flat);
    step.rotateY(-a);
    // 多面体是无索引的，盒子必须转成无索引才能一起 merge
    parts.push(step.toNonIndexed());
  }
  g.add(join(parts, mats.rock));

  // 洞脚：一个半筒形的暗洞，洞里一线极暗的光
  const cave = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 10, 1, false, 0, Math.PI), mats.rock);
  cave.rotation.z = Math.PI / 2;
  cave.rotation.y = 0.5;
  cave.position.set(spread[0] * 0.42, 0.9, spread[1] * 0.2);
  g.add(cave);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow('#c07a3a', 1.4));
  inner.position.copy(cave.position);
  g.add(inner);

  const top = pavilion({ r: 1.4, h: 2.5, sides: 4, mats });
  top.position.set(-spread[0] * 0.12, peak * 0.94, -spread[1] * 0.08);
  g.add(top);
  return g;
}

/** 月洞门：一堵短墙上开一个圆洞 */
function moonGate({ at, yaw, R = 1.5, wallW = 5.2, wallH = 3.6, mats }) {
  const shape = new THREE.Shape();
  shape.moveTo(-wallW / 2, 0); shape.lineTo(wallW / 2, 0);
  shape.lineTo(wallW / 2, wallH); shape.lineTo(-wallW / 2, wallH); shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, R, R, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false });
  const g = new THREE.Group();
  const wall = new THREE.Mesh(geo, mats.wall);
  wall.castShadow = true; wall.receiveShadow = true;
  g.add(wall);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.11, 8, 28), mats.stone);
  ring.position.set(0, R, 0.42);
  g.add(ring);
  g.add(join([box(wallW + 0.3, 0.22, 0.62, 0, wallH + 0.1, 0.2)], mats.tile, false));
  g.position.set(at.x, 0, at.z);
  g.rotation.y = yaw;
  return g;
}

/** 院落里的取位：局部 (x, z) 转世界坐标，z 负为从巷往里 */
export function courtAnchor(siteId, lx, lz) {
  const site = SITE[siteId];
  const p = lanePoint(site.x, site.side * (laneHW(site.x) + 0.4));
  const yaw = yawAt(site.x, site.side);
  return new THREE.Vector3(lx, 0, lz)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .add(new THREE.Vector3(p.x, 0, p.z));
}

/** 佚园里的取位：以园心为原点 */
export function gardenAnchor(lx, lz) {
  const site = SITE.yiyuan;
  const yaw = yawAt(site.x, site.side);
  return new THREE.Vector3(lx, 0, lz)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .add(new THREE.Vector3(KEY.garden.cx, 0, KEY.garden.cz));
}

/** 一处宅院的纵深：门厅—天井—厅堂，两侧廊子夹着 */
export function buildCourtyards(scene) {
  const group = new THREE.Group();
  group.name = 'courtyards';
  scene.add(group);
  const mats = MAT();
  const spots = [];

  const list = [
    { id: 'fushou', bays: 4, hall: '福寿堂', peony: true },
    { id: 'ancestry', bays: 5, hall: '谈氏宗祠', peony: false },
    { id: 'zhang', bays: 4, hall: '张孟肃宅', peony: false },
    { id: 'wanbei', bays: 5, hall: '万备堂', peony: false },
  ];

  for (const spec of list) {
    const site = SITE[spec.id];
    if (!site) continue;
    const p = lanePoint(site.x, site.side * (laneHW(site.x) + 0.4));
    const yaw = yawAt(site.x, site.side);
    // 院子的进深方向：从巷往里
    const w = 9.5 + spec.bays * 0.9;
    const holder = new THREE.Group();
    holder.position.set(p.x, 0, p.z);
    holder.rotation.y = yaw;
    group.add(holder);

    // 门厅在巷边（由 houses.js 的门罩负责外观），这里做它的内面与后天井
    const gateHall = hall({ w, d: 5.2, h: 3.5, rh: 1.5, mats, posts: spec.bays, name: '' });
    gateHall.position.set(0, 0, -3.2);
    holder.add(gateHall);

    const c1 = court({ cx: 0, cz: -8.6, w: w - 1.2, d: 5.4, mats, peony: spec.peony });
    holder.add(c1);

    const main = hall({ w, d: 6.4, h: 4.1, rh: 1.9, mats, posts: spec.bays + 1, name: spec.hall });
    main.position.set(0, 0, -14.6);
    holder.add(main);

    // 两侧廊与院墙
    holder.add(corridor({ from: { x: -w / 2 - 0.4, z: -5.4 }, to: { x: -w / 2 - 0.4, z: -12.4 }, mats }));
    holder.add(corridor({ from: { x: w / 2 + 0.4, z: -5.4 }, to: { x: w / 2 + 0.4, z: -12.4 }, mats }));
    for (const s of [-1, 1]) {
      holder.add(yardWall(
        { x: s * (w / 2 + 1.1), z: -1.2 },
        { x: s * (w / 2 + 1.1), z: -18.4 },
        3.5, mats, 2,
      ));
    }
    holder.add(yardWall({ x: -w / 2 - 1.1, z: -18.4 }, { x: w / 2 + 1.1, z: -18.4 }, 3.5, mats, 0));

    // 天井里的一线灯：檐下灯笼串挂在天井上方
    const lampPos = [];
    for (let i = 0; i < 4; i++) {
      lampPos.push({ x: -w / 2 + w * (i + 0.5) / 4, y: 3.25, z: -6.4 });
    }
    for (const L of lampPos) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow('#ffbe72', 2.5));
      bulb.position.set(L.x, L.y, L.z);
      holder.add(bulb);
    }
    const courtLight = new THREE.PointLight(new THREE.Color('#ffab5e'), 9.5, 17, 2.1);
    courtLight.position.set(0, 3.4, -8.6);
    holder.add(courtLight);

    // 机位锚点在世界坐标：门厅前、天井中、厅堂檐下
    const world = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(p.x, 0, p.z));
    spots.push({
      id: spec.id,
      door: world(0, -1.6),
      court: world(0, -8.6),
      hall: world(0, -11.6),
      facing: yaw,
    });
    registerOccluder(main, 2.0, world(0, -14.6));
  }

  return { group, spots };
}

/** 佚园：宅后一方园子，假山、亭、曲廊、月洞门与一波纹铺地 */
export function buildGarden(scene) {
  const group = new THREE.Group();
  group.name = 'garden';
  scene.add(group);
  const mats = MAT();
  const G = KEY.garden;
  const site = SITE.yiyuan;
  const lp = lanePoint(site.x, site.side * (laneHW(site.x) + 0.4));
  const yaw = yawAt(site.x, site.side);

  const holder = new THREE.Group();
  holder.position.set(G.cx, 0, G.cz);
  group.add(holder);

  // 园墙四面，南面开月洞门
  const hw = G.w / 2, hd = G.d / 2;
  holder.add(yardWall({ x: -hw, z: -hd }, { x: hw, z: -hd }, G.wallH, mats, 3));
  holder.add(yardWall({ x: -hw, z: hd }, { x: -3.2, z: hd }, G.wallH, mats, 2));
  holder.add(yardWall({ x: 3.2, z: hd }, { x: hw, z: hd }, G.wallH, mats, 2));
  holder.add(yardWall({ x: -hw, z: -hd }, { x: -hw, z: hd }, G.wallH, mats, 0));
  holder.add(yardWall({ x: hw, z: -hd }, { x: hw, z: hd }, G.wallH, mats, 0));
  const gate = moonGate({ at: { x: 0, z: hd }, yaw: 0, R: 1.55, wallW: 6.4, wallH: G.wallH, mats });
  holder.add(gate);

  // 旱园水做：满地波文的铺地
  const waveParts = [];
  for (let r = 0; r < 22; r++) {
    const z = -hd + 1.2 + (G.d - 2.4) * (r / 21);
    for (let i = 0; i < 30; i++) {
      const x = -hw + 1 + (G.w - 2) * (i / 29);
      const y = 0.06 + 0.05 * Math.sin(i * 0.9 + r * 0.6);
      waveParts.push(box((G.w - 2) / 29 - 0.05, 0.1, 0.34, x, y, z + 0.16 * Math.sin(i * 0.9 + r * 0.6)));
    }
  }
  holder.add(join(waveParts, new THREE.MeshStandardMaterial({
    color: new THREE.Color('#a9b0be'), map: T.stone('#98a0ae'), roughness: 0.38, metalness: 0.16,
    emissive: new THREE.Color('#16223a'), emissiveIntensity: 0.26,
  }), false));

  const gateLamp = new THREE.PointLight(new THREE.Color('#ffab5e'), 9, 16, 2.2);
  gateLamp.position.set(0, 2.9, hd - 1.2);
  holder.add(gateLamp);
  const rock = rockery({ cx: -hw * 0.42, cz: -hd * 0.35, spread: [7.2, 5.6], peak: 4.6, mats });
  holder.add(rock);
  const pav = pavilion({ r: 1.8, h: 3.0, sides: 6, mats });
  pav.position.set(hw * 0.42, 0.1, -hd * 0.2);
  holder.add(pav);
  holder.add(corridor({ from: { x: hw * 0.66, z: hd * 0.5 }, to: { x: hw * 0.8, z: -hd * 0.15 }, mats }));
  holder.add(corridor({ from: { x: hw * 0.1, z: hd * 0.72 }, to: { x: hw * 0.62, z: hd * 0.66 }, mats }));

  // 几株竹与一株老树
  for (let i = 0; i < 14; i++) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, rr(3.2, 5.2), 5), mats.wood);
    const x = rr(-hw * 0.95, -hw * 0.55), z = rr(-hd * 0.2, hd * 0.25);
    stalk.position.set(x, stalk.geometry.parameters.height / 2, z);
    holder.add(stalk);
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.7, 1.2), 0), mats.leaf);
    tuft.position.set(x, stalk.geometry.parameters.height * 0.94, z);
    tuft.castShadow = true;
    holder.add(tuft);
  }

  // 园里的月：一盏高处的暖灯替月亮把水面照亮
  const glowLight = new THREE.PointLight(new THREE.Color('#cddcff'), 17, 38, 2.0);
  glowLight.position.set(0, 6.2, 0);
  holder.add(glowLight);

  const world = (lx, lz) => new THREE.Vector3(lx, 0, lz)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .add(new THREE.Vector3(G.cx, 0, G.cz));
  void lp;
  return {
    group, holder, world, yaw,
    entry: { x: lp.x, z: lp.z },
    center: { x: G.cx, z: G.cz },
    peak: rock.position.clone(),
  };
}
