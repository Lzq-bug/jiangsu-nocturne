/**
 * 大报恩寺琉璃塔本体。九层八面，通高按明人记载"二十四丈六尺一寸九分"折取 78.2 m（含塔刹）。
 *
 * 可考依据：九层八面（《金陵梵刹志》引奏牍、《客座赘语》卷七）；"纯用琉璃为之，而顶以风磨铜"
 * （《客座赘语》）；构件陶胎施黄绿赭釉、单件约 0.50×0.47 m（南京博物院藏品口径）；塔上下金刚
 * 佛像千百亿金身、一金身琉璃砖十数块凑砌、具三塔相编号识之（张岱《陶庵梦忆》卷一）；券面六拏具
 * （南博藏拱门残件，九块构件拼合）；篝灯 146（《金陵大报恩寺塔志》）。
 *
 * 写意与推定（解说里逐条标明）：逐层层高、层径、收分、檐出、平座栏杆、塔刹细部、灯位分布、门向
 * 南向。西人铜版画被指"夸大了飞檐挑出的距离和上翘的弧度"，故檐出收敛、不照图复刻。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, box } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { TOWER, GROUND_Y, BASE } from './data.js';
import * as T from './textures.js';

const SIDES = TOWER.sides;
const STEP = (Math.PI * 2) / SIDES;
const INR = Math.cos(Math.PI / SIDES);
const faceAz = (k) => (k + 0.5) * STEP;
const cornerAz = (k) => k * STEP;

/** 券拱挡板：矩形 + 半圆顶。几何原点在底边中点，落位 y 即门槛高 */
function archPlate() {
  const s = new THREE.Shape();
  const r = 0.5;
  s.moveTo(-r, 0);
  s.lineTo(-r, 1 - r);
  s.absarc(0, 1 - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** 券圈：中间空出来才看得见洞里的灯与佛 */
function archRingGeo(border = 0.11) {
  const outer = new THREE.Shape();
  const R = 0.5;
  outer.moveTo(-R, 0);
  outer.lineTo(-R, 1 - R);
  outer.absarc(0, 1 - R, R, Math.PI, 0, true);
  outer.lineTo(R, 0);
  outer.closePath();
  const iw = 1 - border * 2, ih = 1 - border * 1.4, r = iw / 2;
  const inner = new THREE.Shape();
  inner.moveTo(-r, border * 0.5);
  inner.lineTo(-r, ih - r);
  inner.absarc(0, ih - r, r, Math.PI, 0, true);
  inner.lineTo(r, border * 0.5);
  inner.closePath();
  outer.holes.push(new THREE.Path(inner.getPoints(14).reverse()));
  return new THREE.ShapeGeometry(outer);
}

function octPrism(rB, rT, h, openEnded = false) {
  const g = new THREE.CylinderGeometry(rT, rB, h, SIDES, 1, openEnded);
  g.translate(0, h / 2, 0);
  return g;
}

/** 放大 uv，使整座塔共用一张砖贴图而每块砖的物理尺寸一致 */
function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

/** 一层檐：琉璃坡面（外宽内窄的倒锥台侧面）+ 檐口压边 + 八角起翘 */
function eaveGeo(r, proj, h, lift) {
  const parts = [];
  const slope = new THREE.CylinderGeometry(r + 0.12, r + proj, h * 0.78, SIDES, 2, true);
  slope.translate(0, h * 0.39, 0);
  parts.push(slope);
  const lip = new THREE.CylinderGeometry(r + proj + 0.16, r + proj + 0.04, h * 0.3, SIDES, 1, false);
  lip.translate(0, h * 0.15, 0);
  parts.push(lip);
  for (let k = 0; k < SIDES; k++) {
    const a = cornerAz(k);
    const tip = new THREE.ConeGeometry(h * 0.44, proj * 0.8, 4, 1);
    tip.rotateX(Math.PI / 2 + 0.42 + lift);
    tip.rotateY(a + Math.PI / 4);
    tip.translate(Math.sin(a) * (r + proj * 0.84), h * 0.46, Math.cos(a) * (r + proj * 0.84));
    parts.push(tip);
  }
  return mergeGeometries(parts);
}

/** 平座栏杆：一面做完复制八份，逐面旋到面心方位 */
function balustradeGeo(rCorner, h) {
  const seg = 2 * Math.sin(Math.PI / SIDES) * rCorner;
  const out = [];
  const posts = Math.max(2, Math.round(seg / 1.5));
  for (let k = 0; k < SIDES; k++) {
    const a = faceAz(k);
    const bits = [
      box(seg, h * 0.34, 0.22, 0, h * 0.17, 0),
      box(seg, 0.11, 0.28, 0, h, 0),
      box(seg, 0.07, 0.16, 0, h * 0.64, 0),
    ];
    for (let i = 0; i <= posts; i++) {
      const u = -seg / 2 + (seg * i) / posts;
      bits.push(box(0.15, h + 0.22, 0.15, u, (h + 0.22) / 2, 0));
      const cap = new THREE.CylinderGeometry(0.11, 0.13, 0.15, 6);
      cap.translate(u, h + 0.28, 0);
      bits.push(cap);
    }
    const g = mergeGeometries(bits);
    g.rotateY(a);
    const d = rCorner * INR;
    g.translate(Math.sin(a) * d, 0, Math.cos(a) * d);
    out.push(g);
  }
  return mergeGeometries(out);
}

export function buildTower(scene) {
  const group = new THREE.Group();
  group.name = 'tower';
  group.position.set(0, GROUND_Y, 0);
  group.rotation.y = TOWER.rot;
  scene.add(group);

  /* ------------------------------------------------------------ 材质 */
  const bandMap = T.glazeBand();
  const glazeMap = T.glazedBrick();
  const bodyMat = lit('#f2ecda', { map: glazeMap, rough: 0.34, metal: 0.06, emissive: '#6d7078', ei: 0.8 });
  // 自发光跟着砖的贴图走，塔身才不会被提亮成一片死白
  bodyMat.emissiveMap = glazeMap;
  const trimMat = lit('#a8c4b2', { map: bandMap, rough: 0.34, metal: 0.08, emissive: '#2b4038', ei: 1.0 });
  const eaveMat = lit('#b6c8cc', { map: T.eaveTiles(), rough: 0.42, metal: 0.06, side: THREE.DoubleSide, emissive: '#384952', ei: 1.2 });
  const stoneMat = lit('#a9a99c', { map: TX.stone('#8b8b80'), rough: 0.9 });
  const copper = lit('#e7b478', { rough: 0.3, metal: 0.92, emissive: '#7a4a10', ei: 1.5 });
  const iron = lit('#6d7280', { rough: 0.5, metal: 0.75, emissive: '#0b0d12', ei: 0.5 });

  /* ------------------------------------------------------------ 塔基：八角双层须弥座 */
  let py = 0;
  BASE.steps.forEach((h, i) => {
    const r = BASE.r - i * 2.1;
    const m = new THREE.Mesh(scaleUV(octPrism(r, r - 0.6, h), (2 * Math.PI * r) / 1.7, h / 0.85), stoneMat);
    m.position.y = py;
    m.receiveShadow = m.castShadow = true;
    group.add(m);
    // 上枋与仰莲：只有薄薄一圈彩釉，台壁本身是石
    const cap = new THREE.Mesh(octPrism(r - 0.55, r - 1.0, 0.34), trimMat);
    cap.position.y = py + h;
    group.add(cap);
    py += h + 0.34;
  });
  const TERRACE = py;
  const terraceIn = (BASE.r - (BASE.steps.length - 1) * 2.1 - 0.6) * INR;

  /* ------------------------------------------------------------ 九层塔身、腰檐、平座 */
  const shafts = [], trims = [], eaves = [], rails = [];
  const tierY = [], tierTop = [];
  let y = TERRACE;
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h, R] = TOWER.body[i];
    const nextR = TOWER.body[i + 1] ? TOWER.body[i + 1][1] : R * 0.9;
    const taper = (R - nextR) * 0.55;
    tierY.push(y);

    shafts.push(scaleUV(octPrism(R, R - taper, h), (2 * Math.PI * R * 0.86) / TOWER.brick.w, h / TOWER.brick.h));
    const band = scaleUV(octPrism(R + 0.14, R + 0.14, 0.5), (2 * Math.PI * R) / 1.2, 1);
    const b1 = band.clone(); b1.translate(0, y + 0.25, 0);
    const b2 = band.clone(); b2.scale((R - taper) / R, 1, (R - taper) / R); b2.translate(0, y + h - 0.3, 0);
    trims.push(b1, b2);

    const proj = TOWER.eaveProj(i);
    const eg = eaveGeo(R - taper, proj, TOWER.eaveH, 0.3 + i * 0.02);
    eg.translate(0, y + h, 0);
    eaves.push(eg);
    // 平座：首层在台顶落地一圈，以上诸层作檐面上短栏（写意做法）
    const rg = balustradeGeo(R - taper + proj * 0.62, i === 0 ? 1.05 : 0.62);
    rg.translate(0, i === 0 ? y + 0.5 : y + h + TOWER.eaveH * 0.62, 0);
    rails.push(rg);

    y += h + TOWER.eaveH;
    tierTop.push(y);
  }
  const bodyTop = y;

  const shaftMesh = new THREE.Mesh(mergeGeometries(shafts), bodyMat);
  shaftMesh.castShadow = shaftMesh.receiveShadow = true;
  const trimMesh = new THREE.Mesh(mergeGeometries(trims), trimMat);
  trimMesh.castShadow = true;
  const eaveMesh = new THREE.Mesh(mergeGeometries(eaves), eaveMat);
  eaveMesh.castShadow = true;
  group.add(shaftMesh, trimMesh, eaveMesh, new THREE.Mesh(mergeGeometries(rails), stoneMat));

  /* ------------------------------------------------------------ 八面：四正辟券门、四维置龛像 */
  const slots = [];
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h, R] = TOWER.body[i];
    const nextR = TOWER.body[i + 1] ? TOWER.body[i + 1][1] : R * 0.9;
    const midR = R - (R - nextR) * 0.55 * 0.5;
    for (let k = 0; k < SIDES; k++) {
      const door = TOWER.doorFaces.includes(k);
      const sc = 1 - i * 0.05;
      slots.push({
        tier: i, k, az: faceAz(k), inr: midR * INR, door,
        w: (door ? 2.5 : 1.85) * sc,
        hh: (door ? Math.min(4.3, h * 0.46) : Math.min(3.3, h * 0.4)) * sc,
        // 首层门与龛落在台顶平座线上，以上诸层在层高里略抬（塔身每层的地板位置无记载，写意）
        y0: tierY[i] + (i === 0 ? 0.4 : h * 0.2),
      });
    }
  }
  const dummy = new THREE.Object3D();
  const ringMat = lit('#c2ccc2', { map: bandMap.clone(), rough: 0.42, emissive: '#1c2421', ei: 0.55 });
  ringMat.map.needsUpdate = true;

  const rings = new THREE.InstancedMesh(archRingGeo(), ringMat, slots.length);
  const mouths = new THREE.InstancedMesh(archPlate(), new THREE.MeshBasicMaterial({ color: 0x07080e, fog: false }), slots.length);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const faceLamp = new THREE.InstancedMesh(archPlate(), lampMat, slots.length);
  faceLamp.name = 'faceLamp';
  faceLamp.frustumCulled = false;

  const figGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.24, 0.36, 0.92, 8).translate(0, 0.56, 0),
    new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.18, 0),
    new THREE.CylinderGeometry(0.46, 0.52, 0.13, 10).translate(0, 0.06, 0),
  ]);
  const figMat = lit('#d9c08a', { rough: 0.32, metal: 0.55, emissive: '#4a3517', ei: 1.0 });
  const figures = new THREE.InstancedMesh(figGeo, figMat, slots.filter((s) => !s.door).length);

  const black = new THREE.Color(0, 0, 0);
  let ni = 0;
  slots.forEach((s, idx) => {
    // 进深次序：券圈（外）→ 龛底暗壁 → 灯面 → 金身（最外，衬暖光成剪影）
    const put = (mesh, off, sx, sy) => {
      dummy.rotation.set(0, s.az, 0);
      dummy.scale.set(s.w * sx, s.hh * sy, 1);
      dummy.position.set(Math.sin(s.az) * (s.inr + off), s.y0, Math.cos(s.az) * (s.inr + off));
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    };
    put(rings, 0.08, 1.28, 1.22);
    put(mouths, -0.66, 0.98, 0.98);
    put(faceLamp, -0.52, 0.86, 0.84);
    faceLamp.setColorAt(idx, black);
    if (!s.door) {
      const sc = s.hh * 0.62;
      dummy.rotation.set(0, s.az, 0);
      dummy.scale.setScalar(sc);
      dummy.position.set(Math.sin(s.az) * (s.inr - 0.18), s.y0 + s.hh * 0.1, Math.cos(s.az) * (s.inr - 0.18));
      dummy.updateMatrix();
      figures.setMatrixAt(ni++, dummy.matrix);
    }
  });
  for (const m of [rings, mouths, faceLamp, figures]) m.instanceMatrix.needsUpdate = true;
  faceLamp.instanceColor.needsUpdate = true;
  group.add(rings, mouths, faceLamp, figures);

  /* ------------------------------------------------------------ 八角角灯与风铎 */
  const corners = [];
  for (let i = 0; i < TOWER.tiers; i++) {
    const [h, R] = TOWER.body[i];
    const nextR = TOWER.body[i + 1] ? TOWER.body[i + 1][1] : R * 0.9;
    const rTop = R - (R - nextR) * 0.55;
    const proj = TOWER.eaveProj(i);
    for (let k = 0; k < SIDES; k++) {
      corners.push({ tier: i, k, az: cornerAz(k), r: rTop + proj, y: tierY[i] + h + TOWER.eaveH * 0.3 });
    }
  }
  const cornerLamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.44, 8, 6), lampMat, corners.length);
  cornerLamp.name = 'cornerLamp';
  cornerLamp.frustumCulled = false;
  const bellGeo = mergeGeometries([
    new THREE.ConeGeometry(0.36, 0.66, 6, 1, true).rotateX(Math.PI),
    new THREE.SphereGeometry(0.11, 6, 5).translate(0, -0.36, 0),
  ]);
  const bells = new THREE.InstancedMesh(bellGeo, copper, corners.length);
  corners.forEach((s, i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.position.set(Math.sin(s.az) * s.r, s.y + 0.2, Math.cos(s.az) * s.r);
    dummy.updateMatrix();
    cornerLamp.setMatrixAt(i, dummy.matrix);
    cornerLamp.setColorAt(i, black);
    dummy.position.set(Math.sin(s.az) * (s.r + 0.22), s.y - 0.5, Math.cos(s.az) * (s.r + 0.22));
    dummy.updateMatrix();
    bells.setMatrixAt(i, dummy.matrix);
  });
  cornerLamp.instanceMatrix.needsUpdate = true;
  cornerLamp.instanceColor.needsUpdate = true;
  bells.instanceMatrix.needsUpdate = true;
  group.add(cornerLamp, bells);

  /* ------------------------------------------------------------ 门前两盏长明 */
  const [h1, R1] = TOWER.body[0];
  const doorIn = R1 * INR;
  const doorH = Math.min(4.3, h1 * 0.46);
  // 南门的面心方位：几何里 (0,0,r) 是角，面心要按 faceAz(0) 转过去
  const dAz = faceAz(0);
  const dx = Math.sin(dAz), dz = Math.cos(dAz);
  const flames = [];
  for (const s of [-1, 1]) {
    const az = dAz + s * 0.34;
    const x = Math.sin(az) * (doorIn + 3.3), z = Math.cos(az) * (doorIn + 3.3);
    const stand = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(0.52, 0.72, 0.32, 8).translate(0, 0.16, 0),
      new THREE.CylinderGeometry(0.15, 0.17, 1.5, 8).translate(0, 1.05, 0),
      new THREE.CylinderGeometry(0.64, 0.36, 0.52, 8).translate(0, 2.0, 0),
    ]), iron);
    stand.position.set(x, TERRACE, z);
    stand.castShadow = true;
    group.add(stand);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), lampMat);
    fl.position.set(x, TERRACE + 2.42, z);
    fl.visible = false;
    group.add(fl);
    flames.push({ mesh: fl, x, y: TERRACE + 2.42, z });
  }

  /* ------------------------------------------------------------ 首层南门的六拏具券面 */
  const badgeMat = new THREE.MeshStandardMaterial({
    map: T.sixBadge(), roughness: 0.38, metalness: 0.06,
    emissive: new THREE.Color('#241d14'), emissiveIntensity: 0.95,
  });
  const bw = 2.5 * 1.4, bh = doorH * 1.02;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), badgeMat);
  // 券面压在门洞之上的壁上，不遮门洞
  badge.position.set(dx * (doorIn + 0.12), slots[0].y0 + doorH + bh * 0.44, dz * (doorIn + 0.12));
  badge.rotation.y = dAz;
  group.add(badge);

  /* ------------------------------------------------------------ 塔刹：风磨铜顶 */
  const spire = new THREE.Group();
  spire.position.y = bodyTop;
  group.add(spire);
  const spireH = TOWER.height - bodyTop;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.15, 0.5, SIDES), iron);
  basin.position.y = 0.25;
  const lotus = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), copper);
  lotus.scale.y = 0.58;
  lotus.position.y = 0.5;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, spireH * 0.7, 8), copper);
  rod.position.y = 0.7 + (spireH * 0.7) / 2;
  spire.add(basin, lotus, rod);
  const ringStep = spireH * 0.1;
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86 - i * 0.095, 0.085, 6, 16), iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.0 + i * ringStep;
    spire.add(ring);
  }
  const canopyY = 1.0 + 7 * ringStep;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.06, 0.66, SIDES, 1, true), iron);
  canopy.position.y = canopyY;
  const jewelY = Math.min(spireH - 0.35, canopyY + ringStep);
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), copper);
  jewel.position.y = jewelY;
  const jewelGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,214,150', 0.12), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  jewelGlow.scale.set(8, 8, 1);
  jewelGlow.position.y = jewelY;
  spire.add(canopy, jewel, jewelGlow);

  // 铁链自刹顶斜拉至顶层八角（写意；"152"系风铎与铁链合计，非铃数）
  const topR = TOWER.body[TOWER.tiers - 1][1] + TOWER.eaveProj(TOWER.tiers - 1);
  for (let c = 0; c < SIDES; c++) {
    const a = cornerAz(c);
    const from = new THREE.Vector3(0, jewelY - 0.5, 0);
    const to = new THREE.Vector3(Math.sin(a) * (topR + 0.5), TOWER.eaveH * 0.4, Math.cos(a) * (topR + 0.5));
    const dir = new THREE.Vector3().subVectors(to, from);
    const bead = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, dir.length(), 4), iron);
    bead.position.copy(from).addScaledVector(dir, 0.5);
    bead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    spire.add(bead);
  }

  // 塔上真实灯只留一盏：门灯把券周砖与六拏具照出体积
  const doorLight = new THREE.PointLight(0xffb469, 34, 28, 2);
  doorLight.position.set(dx * (doorIn + 3.6), TERRACE + 3.6, dz * (doorIn + 3.6));
  group.add(doorLight);

  /* ------------------------------------------------------------ 146 篝灯次第点亮 */
  // 顺序：自下而上；同一层内自南门（面 0）顺时针绕八面，再绕八角角灯；末了两盏门前长明
  // 塔组自身转了 rot、又抬在地坪上，所以外景（光晕、热点、机位）要用世界坐标
  const toW = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), TOWER.rot);
    return [v.x, GROUND_Y + v.y, v.z];
  };
  const seq = [];
  for (let i = 0; i < TOWER.tiers; i++) {
    for (let k = 0; k < SIDES; k++) {
      const s = slots[i * SIDES + k];
      seq.push({ lamp: faceLamp, at: i * SIDES + k, halo: toW(Math.sin(s.az) * s.inr, s.y0 + s.hh * 0.5, Math.cos(s.az) * s.inr) });
    }
    for (let k = 0; k < SIDES; k++) {
      const c = corners[i * SIDES + k];
      seq.push({ lamp: cornerLamp, at: i * SIDES + k, halo: toW(Math.sin(c.az) * c.r, c.y, Math.cos(c.az) * c.r) });
    }
  }
  for (const f of flames) seq.push({ lamp: null, at: -1, flame: f, halo: toW(f.x, f.y, f.z) });
  const TOTAL = seq.length;   // 72 面灯 + 72 角灯 + 2 长明 = 146

  let cur = 0, goal = 0, bright = 1;
  const col = new THREE.Color();
  const warm = new THREE.Color('#ffbe72');
  const mirrors = [];
  function paint() {
    for (let i = 0; i < TOTAL; i++) {
      const it = seq[i];
      const v = THREE.MathUtils.clamp(cur - i, 0, 1);
      const t = v * v * (3 - 2 * v);
      if (it.lamp) it.lamp.setColorAt(it.at, col.copy(warm).multiplyScalar(t));
      else it.flame.mesh.visible = t > 0.4;
    }
    faceLamp.instanceColor.needsUpdate = true;
    cornerLamp.instanceColor.needsUpdate = true;
    // 镜像里的 instanceColor 不跟着源走，抄一份过去，水里的灯才跟着次第亮
    for (const [src, dst] of mirrors) {
      if (dst.instanceColor) { dst.instanceColor.array.set(src.instanceColor.array); dst.instanceColor.needsUpdate = true; }
    }
  }
  paint();

  return {
    group, spire, badge, bells,
    lampTotal: TOTAL,
    /** 机位、热点、光柱都要用的尺寸都从这里出 */
    anchors: {
      TERRACE, bodyTop: GROUND_Y + bodyTop, doorIn, terraceIn, doorH,
      tierTop: tierTop.map((v) => GROUND_Y + v),
      spireTop: new THREE.Vector3(0, GROUND_Y + TOWER.height, 0),
      badge: new THREE.Vector3(...toW(dx * (doorIn + 0.5), badge.position.y, dz * (doorIn + 0.5))),
      door: new THREE.Vector3(...toW(dx * doorIn, slots[0].y0 + doorH * 0.5, dz * doorIn)),
      lampHalos: seq.map((s) => s.halo),
    },
    release(on, snap = false) {
      goal = on ? TOTAL : 0;
      if (snap) { cur = goal; paint(); }
    },
    setLampBright(v) { bright = v; },
    bindMirror(root) {
      const found = [];
      root.traverse((o) => { if (o.isInstancedMesh && o.name) found.push(o); });
      for (const src of [faceLamp, cornerLamp]) {
        const dst = found.find((o) => o.name === src.name);
        if (dst) mirrors.push([src, dst]);
      }
      paint();
    },
    update(t, dt) {
      if (cur !== goal) {
        const up = goal > cur;
        cur = THREE.MathUtils.clamp(cur + (up ? 1 : -1) * dt * (up ? 22 : 70), 0, TOTAL);
        if (Math.abs(cur - goal) < 0.01) cur = goal;
        paint();
      }
      const flick = 0.9 + 0.07 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 6.3 + 1.1);
      // 灯色压住：146 盏一起亮时若给足 HDR，塔就糊成一团白，形制全丢
      lampMat.color.setRGB(0.86, 0.68, 0.44).multiplyScalar(flick * bright);
      jewelGlow.material.opacity = (0.26 + 0.07 * Math.sin(t * 1.3)) * Math.min(1.2, 0.35 + 0.85 * (cur / TOTAL));
      bells.rotation.y = Math.sin(t * 0.5) * 0.01;
      return { lamp: cur / TOTAL };
    },
  };
}
