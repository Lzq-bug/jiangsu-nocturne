import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, mesh, box, chineseRoof, plaqueMesh } from '../kit.js';
import * as T from '../textures.js';
import { TM } from './surfaces.js';
import { WALL, centerZ, topY, faceZ, GATES, DITAI } from './data.js';
import { ribbon, yawAt, placeAt, range, dummy } from './geo.js';

const HALF = WALL.halfTop;

/** 墙身：外撇的收分梯形，底脚埋进土里；湖侧脚低、城侧脚高 */
function bodySection(x) {
  const cz = centerZ(x), ty = topY(x);
  return [
    { z: cz - WALL.halfBase, y: -3 },
    { z: cz - WALL.halfBase, y: WALL.outerGround + 0.7 },
    { z: cz - HALF, y: ty },
    { z: cz + HALF, y: ty },
    { z: cz + WALL.halfBase, y: WALL.innerGround + 0.7 },
    { z: cz + WALL.halfBase, y: -3 },
  ];
}

/** 女墙/宇墙：四点的闭合带，顶面自己收口。sign=-1 外、+1 内 */
function bandProfile(edge, thickness, height, sign) {
  return (x) => {
    const cz = centerZ(x), ty = topY(x);
    const a = cz + sign * edge, b = a - sign * thickness;
    return [
      { z: a, y: ty + 0.02 },
      { z: a, y: ty + height },
      { z: b, y: ty + height },
      { z: b, y: ty + 0.02 },
    ];
  };
}

function paveSection(x) {
  const cz = centerZ(x), ty = topY(x);
  return [{ z: cz - HALF + 0.6, y: ty + 0.07 }, { z: cz + HALF - 0.6, y: ty + 0.07 }];
}

/** 墙顶那一圈暖线：远看把垛口咬成锯齿 */
function stripSection(edge, sign, w = 0.22) {
  return (x) => {
    const cz = centerZ(x), ty = topY(x);
    const a = cz + sign * edge;
    return [{ z: a, y: ty + 0.1 }, { z: a - sign * w, y: ty + 0.1 }];
  };
}

/** 沿 X 分段建带，gaps 里给敌台与登城口让路 */
function bands(profile, gaps, opts) {
  const spans = [];
  let cursor = WALL.xFrom;
  for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) {
    if (a > cursor) spans.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < WALL.xTo) spans.push([cursor, WALL.xTo]);
  const out = [];
  for (const [a, b] of spans) {
    const xs = range(a, b, 4);
    if (xs.length > 1) out.push(ribbon(profile, xs, opts));
  }
  return out;
}

/** 墙面是收分的（往上退），贴在面上的东西都得跟着这个坡度仰起来 */
const _v = new THREE.Vector3();
function faceNormal(sign, x) {
  const ty = topY(x);
  const baseY = sign < 0 ? WALL.outerGround + 0.7 : WALL.innerGround + 0.7;
  const h = Math.max(2, ty - baseY);
  return _v.set(0, WALL.halfBase - WALL.halfTop, sign * h).normalize().clone();
}
function faceQuat(sign, x) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceNormal(sign, x));
}

/* ------------------------------------------------------------------ 券门 */
/**
 * 门不做穿墙的洞：门框石、券脸与一枚暗拱按墙面收分贴上去，夜里读起来就是洞。
 * 解放门是 1954 年的单券门；玄武门 1908 年辟，三券的形制是写意。
 */
function archShape(r, pierH) {
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, pierH);
  s.absarc(0, pierH, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return new THREE.ShapeGeometry(s, 22);
}

function gate({ x, name, arches, width, pierH, groundY, plaque = true }) {
  const g = new THREE.Group();
  const r = width / 2;
  const yc = groundY + pierH + r;
  const stoneParts = [];
  const darkParts = [];
  const cols = [];
  for (let i = 0; i < arches; i++) cols.push(x + (i - (arches - 1) / 2) * (width + 1.5));

  for (const sign of [-1, 1]) {
    for (const cx of cols) {
      // 每一样石材按自己的标高去贴墙面，整组门罩就顺着收分往上收
      const zPier = faceZ(cx, groundY + (pierH + r) / 2, sign) + sign * 0.42;
      const zRing = faceZ(cx, groundY + pierH + r * 0.45, sign) + sign * 0.5;
      const zSill = faceZ(cx, groundY + 0.2, sign) + sign * 0.42;
      const zLint = faceZ(cx, yc + 0.8, sign) + sign * 0.38;
      for (const s of [-1, 1]) {
        stoneParts.push(box(1.15, pierH + r + 0.4, 1.0, cx + s * (r + 0.58), groundY + (pierH + r) / 2 - 0.2, zPier));
      }
      const ring = new THREE.TorusGeometry(r + 0.3, 0.4, 8, 24, Math.PI);
      ring.translate(cx, groundY + pierH, zRing);
      stoneParts.push(ring);
      stoneParts.push(box(width + 2.4, 0.42, 1.0, cx, groundY - 0.25, zSill));
      stoneParts.push(box(width + 3.1, 1.05, 0.85, cx, yc + 0.8, zLint));

      // 暗拱与墙面平行，基准取门脚那一处，整块板才全部露在墙外
      const a = archShape(r, pierH);
      a.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(cx, groundY, faceZ(cx, groundY, sign) + sign * 0.3),
        faceQuat(sign, cx),
        new THREE.Vector3(1, 1, 1),
      ));
      darkParts.push(a);
    }
  }
  g.add(mesh(stoneParts, TM.stone));
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x03050a, side: THREE.DoubleSide, fog: true });
  darkMat.toneMapped = false;
  g.add(new THREE.Mesh(mergeGeometries(darkParts), darkMat));

  // 洞前的一盏灯与一点进深
  for (const cx of cols) {
    const zf = faceZ(cx, groundY + pierH * 0.5, -1);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glow('#ffbe72', 1.7));
    lamp.position.set(cx, groundY + pierH * 0.55, zf - 1.1);
    g.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,196,120', 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.set(3.6, 3.6, 1);
    halo.position.copy(lamp.position);
    g.add(halo);
  }
  const fill = new THREE.PointLight(0xffa657, 40, 34, 2);
  fill.position.set(x, groundY + pierH * 0.8, centerZ(x) + WALL.halfBase + 7);
  g.add(fill);

  if (plaque && name) {
    for (const sign of [-1, 1]) {
      const p = plaqueMesh(name, 2.5, 0.85, { dir: 'h', bg: '#152436', fg: '#f0dcb4', border: '#b9945a' });
      p.position.set(x, yc + 1.9, faceZ(x, yc + 1.9, sign) + sign * 0.5);
      p.rotation.y = sign > 0 ? 0 : Math.PI;
      g.add(p);
    }
  }
  return g;
}

/* ------------------------------------------------------------------ 敌台（写意添加） */
function ditai() {
  const d = DITAI;
  const cz = centerZ(d.x), ty = topY(d.x);
  const g = new THREE.Group();
  const z0 = cz - HALF - d.over, z1 = cz - HALF + 0.6;
  const ph = 1.5;
  const parts = [box(d.len, 3.4, z1 - z0, d.x, ty - 1.5, (z0 + z1) / 2)];
  parts.push(box(d.len, ph, 0.62, d.x, ty + 0.2 + ph / 2, z0 + 0.31));
  for (const s of [-1, 1]) parts.push(box(0.62, ph, z1 - z0, d.x + s * (d.len / 2 - 0.31), ty + 0.2 + ph / 2, (z0 + z1) / 2));
  g.add(mesh(parts, TM.brickOld));

  const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.8, 0.55), TM.brickOld, 20);
  const o = dummy();
  let n = 0;
  for (const px of range(d.x - d.len / 2 + 1.2, d.x + d.len / 2 - 1.2, 2.4)) {
    o.position.set(px, ty + 0.2 + ph + 0.4, z0 + 0.31);
    o.rotation.set(0, 0, 0);
    o.updateMatrix();
    if (n < 20) dm.setMatrixAt(n++, o.matrix);
  }
  dm.count = n;
  dm.instanceMatrix.needsUpdate = true;
  g.add(dm);

  // 窝铺：一间砖房顶上硬山，夜里透出两点光
  const hx = d.x + d.len * 0.2, hz = (z0 + z1) / 2;
  g.add(mesh([box(5.4, 2.9, 3.6, hx, ty + 0.2 + 1.45, hz)], TM.brick));
  const roof = new THREE.Mesh(
    chineseRoof({ width: 6.2, depth: 4.4, height: 1.5, hip: false, ridgeRatio: 0.72, overhang: 0.45 }),
    M.roof,
  );
  roof.position.set(hx, ty + 0.2 + 2.9, hz);
  g.add(roof);
  for (const s of [-1, 1]) {
    const vent = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), glow('#ffb066', 1.7));
    vent.position.set(hx + s * 2.72, ty + 0.2 + 1.75, hz);
    vent.rotation.y = (s * Math.PI) / 2;
    g.add(vent);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), glow('#ffd79b', 2.3));
  lamp.position.set(d.x + d.len * 0.36, ty + 2.6, z0 + 0.35);
  g.add(lamp);
  const l = new THREE.PointLight(0xffc07a, 110, 40, 2);
  l.position.copy(lamp.position);
  g.add(l);
  return g;
}

/* ------------------------------------------------------------------ 登城台阶 */
/** 贴着内侧墙面爬上去的一溜石阶，扶手是两根管加九根立柱 */
function stairs(x0, x1, fromY, width = 2.3) {
  const g = new THREE.Group();
  const toY = topY(x1) + 0.1;
  const rise = toY - fromY;
  const steps = Math.max(10, Math.round(rise / 0.34));
  const tread = Math.abs(x1 - x0) / steps;
  const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(tread * 1.08, 0.34, width), TM.stone, steps);
  const o = dummy();
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const px = x0 + (x1 - x0) * t;
    const py = fromY + (i + 0.5) * (rise / steps);
    const pz = faceZ(px, py, 1) - 1.25;
    o.position.set(px, py, pz);
    o.rotation.set(0, yawAt(px), 0);
    o.updateMatrix();
    dm.setMatrixAt(i, o.matrix);
    pts.push(new THREE.Vector3(px, py, pz));
  }
  dm.instanceMatrix.needsUpdate = true;
  g.add(dm);

  const a = pts[0], b = pts[pts.length - 1];
  const dir = b.clone().sub(a);
  const len = dir.length();
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6), M.beam);
    rail.position.copy(a.clone().addScaledVector(dir, 0.5)).add(new THREE.Vector3(0, 0.95, s * width * 0.5));
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.add(rail);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), M.beam, 9);
    for (let i = 0; i < 9; i++) {
      o.position.copy(a.clone().addScaledVector(dir, i / 8)).add(new THREE.Vector3(0, 0.48, s * width * 0.5));
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      posts.setMatrixAt(i, o.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    g.add(posts);
  }
  return g;
}

/* ------------------------------------------------------------------ 主入口 */
export function buildWall(scene) {
  const group = new THREE.Group();
  group.name = 'taicheng-wall';
  const xs = range(WALL.xFrom, WALL.xTo, 4);

  group.add(new THREE.Mesh(ribbon(bodySection, xs, { closed: true, uScale: 2.4, vScale: 2.8 }), TM.brick));
  group.add(new THREE.Mesh(ribbon(paveSection, xs, { uScale: 2.2, vScale: 2.4 }), TM.pave));

  const stairSpan = [GATES.jiefang.x + 6, GATES.jiefang.x + 48];
  const ditaiSpan = [DITAI.x - DITAI.len / 2 - 1, DITAI.x + DITAI.len / 2 + 1];

  for (const g of bands(bandProfile(HALF, 0.66, 1.2, -1), [], { uScale: 2.4, vScale: 2 })) {
    group.add(new THREE.Mesh(g, TM.brickOld));
  }
  for (const g of bands(bandProfile(HALF - 0.04, 0.6, 1.05, 1), [stairSpan], { uScale: 2.4, vScale: 2 })) {
    group.add(new THREE.Mesh(g, TM.brickOld));
  }

  // 垛口
  const spots = [];
  for (let px = WALL.xFrom; px <= WALL.xTo; px += WALL.merlonSpacing) {
    if (px > ditaiSpan[0] - 1.2 && px < ditaiSpan[1] + 1.2) continue;
    spots.push(px);
  }
  const mh = WALL.merlonH - 1.2;
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, mh, 0.52), TM.brickOld, spots.length);
  const o = dummy();
  spots.forEach((px, i) => {
    o.position.set(px, topY(px) + 1.2 + mh / 2, centerZ(px) - HALF + 0.33);
    o.rotation.set(0, yawAt(px), 0);
    o.updateMatrix();
    merlons.setMatrixAt(i, o.matrix);
  });
  merlons.instanceMatrix.needsUpdate = true;
  group.add(merlons);

  // 排水石槽：每隔十来米从坡面上探出一只
  const spouts = range(WALL.xFrom + 6, WALL.xTo - 6, 11.5);
  const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.42, 1.7), TM.stone, spouts.length);
  spouts.forEach((px, i) => {
    const y = topY(px) - 3.4;
    placeAt(o, px, faceZ(px, y, -1) - centerZ(px) - 0.7, y);
    sm.setMatrixAt(i, o.matrix);
  });
  sm.instanceMatrix.needsUpdate = true;
  group.add(sm);

  // 墙顶灯带
  const stripMat = glow('#ffb46a', 1.2);
  for (const g of bands(stripSection(HALF - 0.62, -1), [], { uScale: 6, vScale: 2 })) {
    const m = new THREE.Mesh(g, stripMat);
    m.renderOrder = 2;
    group.add(m);
  }
  for (const g of bands(stripSection(HALF - 0.68, 1), [stairSpan], { uScale: 6, vScale: 2 })) {
    const m = new THREE.Mesh(g, stripMat);
    m.renderOrder = 2;
    group.add(m);
  }

  // 马道灯杆一行，全贴内侧，不挡湖
  const nLamp = Math.floor((WALL.xTo - WALL.xFrom) / 26) + 1;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 6), M.ink, nLamp);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), glow('#ffd79b', 2.3), nLamp);
  const haloMap = T.softGlow('255,206,140', 0.1);
  let li = 0;
  for (let px = WALL.xFrom + 8; px < WALL.xTo && li < nLamp; px += 26, li++) {
    const dz = HALF - 1.1;
    o.rotation.set(0, 0, 0);
    o.position.set(px, topY(px) + 1.8, centerZ(px) + dz);
    o.updateMatrix();
    poles.setMatrixAt(li, o.matrix);
    o.position.set(px, topY(px) + 3.6, centerZ(px) + dz);
    o.updateMatrix();
    heads.setMatrixAt(li, o.matrix);
    if (li % 3 === 0) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      halo.scale.set(3.4, 3.4, 1);
      halo.position.copy(o.position);
      group.add(halo);
    }
  }
  poles.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  group.add(poles, heads);

  // 六盏真光把砖面读出来，其余交给自发光与 bloom
  const lampLights = [];
  for (const [i, px] of [-250, -120, -20, 80, 170, 280].entries()) {
    // 一盏照外垛一盏照内宇墙，轮着来，齿的迎人面才不会是全黑
    const dz = (i % 2 ? 1 : -1) * (HALF - 1.0);
    const l = new THREE.PointLight(0xffb877, 170, 86, 2);
    l.userData.base = 170;
    l.position.set(px, topY(px) + 2.6, centerZ(px) + dz);
    group.add(l);
    lampLights.push(l);
  }

  // 泛光：湖侧与城侧各打一片暖雾，墙才不是一整块黑
  const wash = new THREE.InstancedMesh(new THREE.PlaneGeometry(9.5, 19), new THREE.MeshBasicMaterial({
    map: T.cloudPuff(), color: 0xffa960, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), 100);
  wash.renderOrder = 3;
  let wi = 0;
  for (const sign of [-1, 1]) {
    for (let px = WALL.xFrom + 4; px < WALL.xTo - 4 && wi < 100; px += 15) {
      const y = topY(px) - 10;
      o.quaternion.copy(faceQuat(sign, px));
      o.position.set(px, y, faceZ(px, y, sign) + sign * 0.8);
      o.updateMatrix();
      wash.setMatrixAt(wi++, o.matrix);
    }
  }
  wash.count = wi;
  wash.instanceMatrix.needsUpdate = true;
  group.add(wash);

  group.add(ditai());
  group.add(gate({ x: GATES.jiefang.x, name: '解放门', arches: 1, width: 4.3, pierH: 4.2, groundY: WALL.innerGround - 0.4 }));
  group.add(gate({ x: GATES.xuanwu.x, name: '玄武门', arches: 3, width: 3.4, pierH: 3.4, groundY: WALL.outerGround + 0.5 }));
  group.add(stairs(GATES.jiefang.x + 48, GATES.jiefang.x + 6, WALL.innerGround + 0.2));

  scene.add(group);
  return { group, lampLights, merlonSpots: spots };
}
