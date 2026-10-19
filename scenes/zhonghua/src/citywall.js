import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, box, wallWithArches, archFace, crenellation, parapet,
  rampGeo, rampShell, plinthGeo, plaqueMesh, registerOccluder,
} from './kit.js';
import {
  GROUND_Y as G, WALK_Y, CREST_Y, CREST_H, HALF_W, SIDE_T, COURT_HALF,
  WALLS, COURTS, PASSAGE,
} from './data.js';
import * as T from './textures.js';

const FULL_W = HALF_W * 2;                       // 118.5，与"东西宽 118.5 米"对上
const SIDE_Z0 = WALLS.first.z[0];                // -64，最外一道垣的南面
const SIDE_Z1 = WALLS.main.z[0];                 // 48，城台的南面
const SIDE_LEN = SIDE_Z1 - SIDE_Z0;              // 112
const SIDE_CZ = (SIDE_Z0 + SIDE_Z1) / 2;         // -8
const RAMP_RUN = 86, RAMP_W = 8;                 // 坡道长八十六米，升到庭顶

/** 洞口落在哪重瓮城里，就归哪一段灯阵 */
function courtGroup(z) {
  for (const c of COURTS) if (z >= c.z[0] && z <= c.z[1]) return c.id;
  return COURTS.length;
}

/* ------------------------------------------------------------------ 洞口总表 */

/**
 * 27 座藏兵洞。总数、以及"城台下分两层共十三座"这两条取自公开记载；
 * 每座洞的洞位、层内分配与洞深，各家说法互异，这里是按可看性排的写意布局。
 * x/y/z 是洞口下沿中点的世界坐标，nx/nz 是洞口朝外的法线。
 */
export const CAVES = [];
export const PASSAGES = [];

function cave(rec) {
  rec.spring = rec.h - rec.w / 2;
  rec.wallKind = rec.wall === 'sideE' || rec.wall === 'sideW' ? 'side' : 'ew';
  // 洞深小于垣厚一个身位以上，说明另一面也被打通了——那一侧同样要挂灯
  rec.pierces = rec.depth + 1.2 < rec.wt;
  CAVES.push(rec);
  return rec;
}

// —— 瓮城两侧垣体（8 座）：洞口开在垣的北面，朝各自那重瓮城
const COURT_CAVES = {
  first: { xs: [-20, 20], w: 3.6, h: 4.6, group: 1 },
  second: { xs: [-22, 22], w: 3.6, h: 4.6, group: 2 },
  third: { xs: [-30, -14, 14, 30], w: 3.8, h: 4.8, group: 3 },
};
for (const [key, spec] of Object.entries(COURT_CAVES)) {
  for (const x of spec.xs) {
    cave({
      wall: key, local: x, tier: 0, group: spec.group, wt: WALLS[key].t,
      x, y: G, z: WALLS[key].z[1], nx: 0, nz: 1,
      w: spec.w, h: spec.h, depth: WALLS[key].t - 2.6,
    });
  }
}

// —— 马道所在的东西侧垣（6 座）：洞口朝瓮城内
for (const [wall, sign, zs] of [['sideE', 1, [-46, -6, 26]], ['sideW', -1, [-42, -10, 30]]]) {
  for (const z of zs) {
    cave({
      wall, local: z - SIDE_CZ, tier: 0, group: courtGroup(z), wt: SIDE_T,
      x: sign * COURT_HALF, y: G, z, nx: -sign, nz: 0,
      w: 3.4, h: 4.4, depth: 11,
    });
  }
}

// —— 城台下（13 座）：南面开洞，下层六、中层七
const MOUTH_Z = WALLS.main.z[0];
for (const x of [-40, -26, -12, 12, 26, 40]) {
  cave({ wall: 'main', local: x, tier: 0, group: 4, wt: WALLS.main.t, x, y: G, z: MOUTH_Z, nx: 0, nz: -1, w: 4.0, h: 5.0, depth: 13 });
}
for (const x of [-40, -26, -12, 0, 12, 26, 40]) {
  cave({ wall: 'main', local: x, tier: 1, group: 4, wt: WALLS.main.t, x, y: G + 11.4, z: MOUTH_Z, nx: 0, nz: -1, w: 3.8, h: 4.2, depth: 10.5 });
}

// —— 四道券门
const PASSAGE_SPECS = [
  ['first', PASSAGE.width, PASSAGE.height],
  ['second', PASSAGE.width, PASSAGE.height],
  ['third', PASSAGE.width, PASSAGE.height],
  ['main', 7.0, 9.0],
];
const PASSAGE_GROUP = { first: 1, second: 2, third: 3, main: 4 };
for (const [key, w, h] of PASSAGE_SPECS) {
  const wl = WALLS[key];
  PASSAGES.push({
    key, w, h, spring: h - w / 2, cz: (wl.z[0] + wl.z[1]) / 2, t: wl.t,
    group: PASSAGE_GROUP[key],
  });
}

/* ------------------------------------------------------------------ 小工具 */

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function placed(geo, x, y, z, ry = 0) {
  const c = geo.clone();
  _e.set(0, ry, 0);
  c.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), _q.setFromEuler(_e), new THREE.Vector3(1, 1, 1),
  ));
  return c;
}

/** 券脸石与洞底封砖都攒在一起，最后合成一次绘制 */
let faceGeos = [];

/** 一个洞口的券脸：半圆券 + 两侧券脚，整圈突出墙面一点 */
function addFace({ x, y, z, nx, nz, w, spring }, proud = 0.16) {
  faceGeos.push(placed(
    archFace(w / 2, { ring: 0.6, depth: 0.44, count: 13, spring, jamb: 1.0 }),
    x + nx * proud, y, z + nz * proud, Math.atan2(nx, nz),
  ));
}

/** 券洞是通的，藏兵洞不是——在洞底堵一道封墙，洞就变成死巷 */
function addPlug(c) {
  const g = new THREE.BoxGeometry(c.w + 0.9, c.h + 1.1, 0.9);
  faceGeos.push(placed(
    g, c.x - c.nx * c.depth, c.y + c.h / 2 - 0.55, c.z - c.nz * c.depth,
    Math.atan2(c.nx, c.nz),
  ));
}

/* ------------------------------------------------------------------ 城垣 */

function ewOpenings(key) {
  const out = [];
  const p = PASSAGES.find((s) => s.key === key);
  if (p) out.push({ at: 0, width: p.w, height: p.h });
  for (const c of CAVES.filter((k) => k.wall === key)) {
    out.push({ at: c.local, width: c.w, height: c.h, bottom: c.y - G });
  }
  return out;
}

/** 千斤闸：券洞内两侧各一道竖向闸槽，闸门落下时卡在槽里 */
function gateGrooves(parent, p) {
  const parts = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.4, p.h - 1.4, p.t - 1.4);
    g.translate(s * (p.w / 2 - 0.14), G + 0.5 + (p.h - 1.4) / 2, p.cz);
    parts.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), M.stoneDressed);
  m.receiveShadow = true;
  parent.add(m);
}

/** 一道沿东西走向的城垣：垣身、基座、顶面压石、两面雉堞 */
function buildEWWall(parent, key) {
  const wl = WALLS[key];
  const t = wl.z[1] - wl.z[0];
  const cz = (wl.z[0] + wl.z[1]) / 2;

  // ExtrudeGeometry 分两组：0 是南北两张立面，1 是洞内壁与上下棱
  const wall = new THREE.Mesh(
    wallWithArches({ width: FULL_W, height: WALK_Y, thick: t, openings: ewOpenings(key) }),
    [M.brick, M.brickInner],
  );
  wall.position.set(0, G, cz);
  wall.castShadow = wall.receiveShadow = true;
  parent.add(wall);

  const plinth = new THREE.Mesh(plinthGeo(FULL_W, 2.4, t, { proud: 0.42 }), M.granite);
  plinth.position.set(0, G - 2.4, cz);
  plinth.castShadow = plinth.receiveShadow = true;
  parent.add(plinth);

  const coping = new THREE.Mesh(box(FULL_W, CREST_Y - WALK_Y, t + 0.32), M.graniteWet);
  coping.position.set(0, G + (WALK_Y + CREST_Y) / 2, cz);
  coping.receiveShadow = true;
  parent.add(coping);

  // 垣顶两面都排垛：进得瓮城的敌人在哪一面都是被射的方向
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(crenellation(FULL_W, { height: CREST_H, thick: 0.74 }), M.brickWarm);
    c.position.set(0, G + CREST_Y, cz + s * (t / 2 - 0.37));
    c.castShadow = c.receiveShadow = true;
    parent.add(c);
  }

  const p = PASSAGES.find((s) => s.key === key);
  if (p) {
    for (const s of [-1, 1]) {
      addFace({ x: 0, y: G, z: cz + s * (t / 2), nx: 0, nz: s, w: p.w, spring: p.spring });
    }
    gateGrooves(parent, p);
  }
  for (const c of CAVES.filter((k) => k.wall === key)) {
    addFace(c);
    addPlug(c);
  }
}

/** 一道沿南北走向的侧垣（马道就在它外侧） */
function buildSideWall(parent, sign) {
  const key = sign > 0 ? 'sideE' : 'sideW';
  const cx = sign * (HALF_W - SIDE_T / 2);
  const openings = CAVES.filter((k) => k.wall === key)
    .map((c) => ({ at: c.local, width: c.w, height: c.h, bottom: c.y - G }));

  // 同一份几何转 -90°：局部 X 落到世界 +Z，局部 Z 落到世界 -X，
  // 于是东西两侧都能用同一个朝向关系（内侧面始终朝瓮城）
  const wall = new THREE.Mesh(
    wallWithArches({ width: SIDE_LEN, height: WALK_Y, thick: SIDE_T, openings }),
    [M.brick, M.brickInner],
  );
  wall.rotation.y = -Math.PI / 2;
  wall.position.set(cx, G, SIDE_CZ);
  wall.castShadow = wall.receiveShadow = true;
  parent.add(wall);

  const plinth = new THREE.Mesh(plinthGeo(SIDE_LEN, 2.4, SIDE_T, { proud: 0.42 }), M.granite);
  plinth.rotation.y = Math.PI / 2;
  plinth.position.set(cx, G - 2.4, SIDE_CZ);
  plinth.castShadow = plinth.receiveShadow = true;
  parent.add(plinth);

  const coping = new THREE.Mesh(box(SIDE_T + 0.32, CREST_Y - WALK_Y, SIDE_LEN), M.graniteWet);
  coping.position.set(cx, G + (WALK_Y + CREST_Y) / 2, SIDE_CZ);
  coping.receiveShadow = true;
  parent.add(coping);

  for (const fx of [sign * (HALF_W - 0.37), sign * (COURT_HALF + 0.37)]) {
    const c = new THREE.Mesh(crenellation(SIDE_LEN, { height: CREST_H, thick: 0.74 }), M.brickWarm);
    c.rotation.y = Math.PI / 2;
    c.position.set(fx, G + CREST_Y, SIDE_CZ);
    c.castShadow = c.receiveShadow = true;
    parent.add(c);
  }

  for (const c of CAVES.filter((k) => k.wall === key)) {
    addFace(c);
    addPlug(c);
  }
}

/** 主城垣自城台向东西继续展开，把城南圈在里面 */
function buildCityArm(parent, sign) {
  const from = HALF_W, to = 402;
  const w = to - from;
  const x = sign * (from + w / 2);
  const cz = (WALLS.main.z[0] + WALLS.main.z[1]) / 2;

  const wall = new THREE.Mesh(
    wallWithArches({ width: w, height: WALK_Y, thick: WALLS.main.t, openings: [] }),
    [M.brick, M.brickInner],
  );
  wall.position.set(x, G, cz);
  wall.castShadow = wall.receiveShadow = true;
  parent.add(wall);

  const coping = new THREE.Mesh(box(w, CREST_Y - WALK_Y, WALLS.main.t + 0.32), M.graniteWet);
  coping.position.set(x, G + (WALK_Y + CREST_Y) / 2, cz);
  parent.add(coping);

  const outC = new THREE.Mesh(crenellation(w, { height: CREST_H, thick: 0.74 }), M.brickWarm);
  outC.position.set(x, G + CREST_Y, WALLS.main.z[0] + 0.37);
  outC.castShadow = outC.receiveShadow = true;
  parent.add(outC);
  const inP = new THREE.Mesh(parapet(w, { height: 1.06, thick: 0.52 }), M.brickWarm);
  inP.position.set(x, G + CREST_Y, WALLS.main.z[1] - 0.37);
  inP.castShadow = inP.receiveShadow = true;
  parent.add(inP);

  // 两尊马面探出墙外，给远处的轮廓一点节奏
  for (const d of [152, 284]) {
    const bx = sign * d, bz = WALLS.main.z[0] - 11;
    const tower = new THREE.Mesh(box(19, WALK_Y + 1.7, 24), M.brick);
    tower.position.set(bx, G + (WALK_Y + 1.7) / 2, bz);
    tower.castShadow = tower.receiveShadow = true;
    parent.add(tower);
    const cap = new THREE.Mesh(box(19.7, 0.3, 24.7), M.graniteWet);
    cap.position.set(bx, G + WALK_Y + 1.7 + 0.15, bz);
    parent.add(cap);
    const ty = G + WALK_Y + 1.7 + 0.3;
    const south = new THREE.Mesh(crenellation(19, { height: 1.5, thick: 0.7, pitch: 2.4 }), M.brickWarm);
    south.position.set(bx, ty, bz - 11.65);
    parent.add(south);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(crenellation(24, { height: 1.5, thick: 0.7, pitch: 2.4 }), M.brickWarm);
      e.rotation.y = Math.PI / 2;
      e.position.set(bx + s * 8.65, ty, bz);
      e.castShadow = true;
      parent.add(e);
    }
  }
}

/* ------------------------------------------------------------------ 马道 */

function buildRamps(parent) {
  // 两侧同用 -90°：局部 x 落到世界 +z，所以低端都在 z=SIDE_Z0，一路往北升高
  const zAt = SIDE_Z0;
  const bandT = 1.0;
  for (const sign of [-1, 1]) {
    const ramp = new THREE.Mesh(rampGeo({ run: RAMP_RUN, rise: WALK_Y, width: RAMP_W }), M.brick);
    ramp.rotation.y = -Math.PI / 2;
    ramp.position.set(sign * (HALF_W + RAMP_W / 2), G, zAt);
    ramp.castShadow = ramp.receiveShadow = true;
    parent.add(ramp);

    const parapetBand = new THREE.Mesh(
      rampShell({ run: RAMP_RUN, rise: WALK_Y, width: 0.62, t: bandT }), M.brickWarm,
    );
    parapetBand.rotation.y = -Math.PI / 2;
    parapetBand.position.set(sign * (HALF_W + RAMP_W - 0.31), G, zAt);
    parapetBand.castShadow = parapetBand.receiveShadow = true;
    parent.add(parapetBand);

    // 坡顶一段平台，把马道并进城台的走道。只占垣外那半幅，
    // 免得与侧垣顶面的压石同高重叠、闪面
    const landing = new THREE.Mesh(box(RAMP_W, CREST_Y - WALK_Y, 42), M.graniteWet);
    landing.position.set(sign * (HALF_W + RAMP_W / 2), G + (WALK_Y + CREST_Y) / 2, 43);
    landing.receiveShadow = true;
    parent.add(landing);
    const lc = new THREE.Mesh(crenellation(42, { height: CREST_H, thick: 0.72 }), M.brickWarm);
    lc.rotation.y = Math.PI / 2;
    lc.position.set(sign * (HALF_W + RAMP_W - 0.36), G + CREST_Y, 43);
    lc.castShadow = lc.receiveShadow = true;
    parent.add(lc);
  }
}

/* ------------------------------------------------------------------ 门额与题刻 */

// 铭文只取有据可查的官衔与人名，其余按空缺处理；渲染出来的是摹刻示意
const CARVE = ['南康府提調官', '通判趙斌', '甲首劉德華', '造磚人夫馮世忠'];

function buildInscriptions(parent, anchors) {
  // 门额在城台北面、第四道券门之上，朝城内
  const plaque = plaqueMesh('中華門', 7.2, 2.5, { dir: 'h', bg: '#20242f', fg: '#e7d4ac', border: '#7c6c4a' });
  plaque.position.set(0, G + 12.4, WALLS.main.z[1] + 0.12);
  parent.add(plaque);
  anchors.plaque = new THREE.Vector3(0, G + 12.4, WALLS.main.z[1] + 0.1);

  // 铭文砖砌在第二道券门垣的北面上，凑近了看得见字。
  // 瓮城深处本就没什么光，所以让砖面自己带一点暖光——像旁边挑了一盏灯
  const map = T.brickCarving(CARVE);
  const mat = new THREE.MeshStandardMaterial({
    map, roughness: 0.95, emissive: new THREE.Color('#ffd6a2'), emissiveMap: map, emissiveIntensity: 0.42,
  });
  const w = 1.68, h = 1.42;
  // 边框必须整块退到砖面后面，否则它会盖在字上——先前就是这样拍出一块空砖
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel.position.set(-16.4, G + 2.05, WALLS.second.z[1] + 0.16);
  parent.add(registerOccluder(panel, 1.8));

  const frame = new THREE.Mesh(box(w + 0.46, h + 0.4, 0.3), M.granite);
  frame.position.set(-16.4, G + 2.05, WALLS.second.z[1] - 0.02);
  frame.receiveShadow = true;
  parent.add(registerOccluder(frame, 1.8));
  anchors.inscription = panel.position.clone();

  // 再往北一面也砌一块，鸟瞰与城头机位能读出"这墙上的砖是有字的"
  const panel2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel2.position.set(25.6, G + 2.6, WALLS.third.z[1] + 0.16);
  parent.add(panel2);
  const frame2 = new THREE.Mesh(box(w + 0.46, h + 0.4, 0.3), M.granite);
  frame2.position.set(25.6, G + 2.6, WALLS.third.z[1] - 0.02);
  parent.add(frame2);
}

/* ------------------------------------------------------------------ 院子细节 */

function buildCourtDetails(parent, anchors) {
  // 中轴一道御道条石，自第一道券门直通第四道，四段券洞被它串起来
  const path = new THREE.Mesh(box(3.6, 0.16, 124), M.graniteWet);
  path.position.set(0, G + 0.08, -8);
  path.receiveShadow = true;
  parent.add(path);

  for (const c of COURTS) {
    const cz = (c.z[0] + c.z[1]) / 2;
    const span = c.z[1] - c.z[0];
    for (const sx of [-1, 1]) {
      // 贴墙根一圈散水石，让垣脚与地面有个交代
      const s = new THREE.Mesh(box(2.6, 0.2, span - 1.2), M.granite);
      s.position.set(sx * (COURT_HALF - 1.3), G + 0.1, cz);
      s.receiveShadow = true;
      parent.add(s);
      // 四角井台/墩台，夜里人的聚集点，也是灯杆的位置
      for (const sz of [-1, 1]) {
        const base = new THREE.Mesh(box(1.7, 0.6, 1.7), M.granite);
        base.position.set(sx * (COURT_HALF - 6), G + 0.3, cz + sz * (span / 2 - 5));
        base.castShadow = base.receiveShadow = true;
        parent.add(base);
        anchors.corners.push(new THREE.Vector3(sx * (COURT_HALF - 6), G + 0.6, cz + sz * (span / 2 - 5)));
      }
    }
  }
}

/* ------------------------------------------------------------------ 装配 */

export function buildGate(scene) {
  faceGeos = [];
  const anchors = { corners: [], plaque: null, inscription: null };
  const group = new THREE.Group();
  group.name = 'zhonghua-gate';

  for (const key of ['first', 'second', 'third', 'main']) buildEWWall(group, key);
  buildSideWall(group, 1);
  buildSideWall(group, -1);
  buildCityArm(group, 1);
  buildCityArm(group, -1);
  buildRamps(group);

  if (faceGeos.length) {
    const faces = new THREE.Mesh(mergeGeometries(faceGeos), M.brickWarm);
    faces.castShadow = faces.receiveShadow = true;
    group.add(faces);
  }
  faceGeos = [];

  buildCourtDetails(group, anchors);
  buildInscriptions(group, anchors);
  scene.add(group);

  // 城台顶是一整块空台面——原城楼 1937 年毁于炮火后没有复建
  anchors.platform = {
    x: [-HALF_W, HALF_W], z: [WALLS.main.z[0], WALLS.main.z[1]], y: G + CREST_Y,
  };
  anchors.courts = COURTS.map((c) => ({
    id: c.id, x: [-COURT_HALF, COURT_HALF], z: [c.z[0], c.z[1]], y: G,
    mouthZ: c.z[0], farZ: c.z[1],
  }));
  anchors.wallRuns = [
    ...Object.values(WALLS).map((w) => ({
      axis: 'x', len: FULL_W, cz: (w.z[0] + w.z[1]) / 2,
      faces: [w.z[0] + 0.37, w.z[1] - 0.37], y: G + CREST_Y,
    })),
    ...[-1, 1].flatMap((s) => [
      { axis: 'z', len: SIDE_LEN, cz: SIDE_CZ, faces: [s * (HALF_W - 0.37)], y: G + CREST_Y },
      { axis: 'z', len: SIDE_LEN, cz: SIDE_CZ, faces: [s * (COURT_HALF + 0.37)], y: G + CREST_Y },
    ]),
  ];
  anchors.ramps = [-1, 1].map((sign) => ({
    sign, x: sign * (HALF_W + RAMP_W - 0.31), z0: SIDE_Z0, z1: SIDE_Z0 + RAMP_RUN,
    rise: WALK_Y, top: G + WALK_Y + 1.0,
  }));
  anchors.caves = CAVES;
  anchors.passages = PASSAGES;
  anchors.groundY = G;

  return { group, anchors };
}

export const GEOM = { FULL_W, SIDE_LEN, SIDE_CZ, SIDE_Z0, SIDE_Z1, RAMP_RUN, RAMP_W };
