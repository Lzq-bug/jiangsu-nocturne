import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, lit, box, mesh, rand, rr, pillarGeo, railingGeo, bracketGeo, chineseRoof, ridgeOrnament, plaqueMesh } from '../kit.js';
import * as T from '../textures.js';

export const SXH = {
  waterY: 0,
  bankY: 2.4,
  roofGray: '#c8d2e2',
  stone: '#a8aeba',
};

const sxMats = {};
export function initSxhMaterials() {
  sxMats.whitePlaster = lit('#e6e9ee', { map: T.plaster('#d9dee6'), rough: 0.92, emissive: '#1b2233', ei: 0.5 });
  sxMats.gilt = lit('#e0bb74', { rough: 0.3, metal: 0.8, emissive: '#3a2a0c', ei: 0.7 });
  sxMats.bronze = lit('#8a7c5c', { rough: 0.4, metal: 0.75 });
  sxMats.pine = lit('#3a4a3c', { map: T.wood('#2f3a2c', '#1d2318'), rough: 0.9 });
  sxMats.blossom = lit('#c08a9c', { rough: 0.95, side: THREE.DoubleSide, emissive: '#241318', ei: 0.3 });
  sxMats.willow = lit('#5d8a63', { rough: 0.95, side: THREE.DoubleSide, emissive: '#152418', ei: 0.4 });
  sxMats.reed = lit('#8f9a7a', { rough: 0.98, side: THREE.DoubleSide });
  sxMats.lotus = lit('#3f6b55', { rough: 0.9, side: THREE.DoubleSide, emissive: '#0f1d18', ei: 0.4 });
  sxMats.rock = lit('#8d93a1', { map: T.stone('#767d8c'), rough: 0.95 });
  sxMats.pavement = lit('#a8aeb9', { map: T.stone('#8b919d'), rough: 0.94, emissive: '#141b28', ei: 0.5 });
  sxMats.deck = lit('#6b4a34', { map: T.wood('#4c3324', '#2a1a12'), rough: 0.8 });
  sxMats.screen = lit('#c3b9a3', { map: T.plaster('#aca28c'), rough: 0.95, emissive: '#171410', ei: 0.35 });
  // ExtrudeGeometry 的 uv 就是形状坐标，所以按"米"给 repeat；默认的 stoneDressed 会把拱顶拉成米色大砖
  sxMats.bridgeStone = lit('#98a0ae', { map: T.stone('#666d7b'), rough: 0.95, emissive: '#0b111c', ei: 0.3 });
  sxMats.bridgeStone.map = sxMats.bridgeStone.map.clone();
  sxMats.bridgeStone.map.repeat.set(0.09, 0.09);
  sxMats.bridgeStone.map.needsUpdate = true;
  sxMats.rock.map = sxMats.rock.map.clone();
  sxMats.rock.map.repeat.set(0.5, 0.5);
  return sxMats;
}
export const S = sxMats;

/* ------------------------------------------------------------------ 攒尖顶 */
/**
 * 多角攒尖：半径随高度收分、母线反曲、檐角起翘。
 * 每条檐边插 sub 个采样点，起翘权重按"离角远近"给，否则整圈等高就变成纯圆锥了。
 */
export function tentedRoof({ sides = 6, radius, height, curve = 0.55, lift = 0.5, overhang = 0.35, tiers = 1 }) {
  const parts = [];
  const sub = 4;
  const n = sides * sub;
  const seg = 7;
  for (let ti = 0; ti < tiers; ti++) {
    const last = ti === tiers - 1;
    const h = height * (last ? 1 : 0.62);
    const yBase = tiers === 1 ? 0 : ti * height * 0.42;
    const rBottom = radius + overhang;
    const pos = [], uvs = [], idx = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const tt = t * (1 - curve) + Math.sqrt(t) * curve;
      const rad = rBottom * (1 - tt);
      const y0 = yBase + h * tt;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const atCorner = Math.abs(Math.cos(Math.PI * ((i % sub) / sub)));
        const y = y0 + h * lift * 0.2 * Math.pow(t, 2.4) * atCorner;
        pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
        // 瓦楞沿半径走，所以 u 取角度、v 取高度
        uvs.push((i / n) * sides * 2.2, tt * 1.6);
      }
    }
    for (let s = 0; s < seg; s++) {
      for (let i = 0; i < n; i++) {
        const a = s * n + i, b = s * n + ((i + 1) % n);
        const c = (s + 1) * n + i, d = (s + 1) * n + ((i + 1) % n);
        idx.push(a, c, b, b, c, d);
      }
    }
    const apex = (seg + 1) * n;
    pos.push(0, yBase + h + h * lift * 0.2, 0);
    uvs.push(0, 1.15);
    for (let i = 0; i < n; i++) idx.push(seg * n + i, seg * n + ((i + 1) % n), apex);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);

    const rim = new THREE.TorusGeometry(rBottom, 0.12, 5, Math.max(24, n));
    rim.rotateX(Math.PI / 2);
    rim.translate(0, yBase + 0.04, 0);
    parts.push(rim);
    // 垂脊不做：屋顶母线是反曲的，直的脊一定会从坡面下沿戳出来，夜里也根本看不见
  }
  return mergeGeometries(parts);
}

export function finial(h = 1.1, r = 0.3) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(r * 0.35, r * 0.5, h * 0.5, 8);
  stem.translate(0, h * 0.25, 0);
  parts.push(stem);
  const bulb = new THREE.SphereGeometry(r, 12, 9);
  bulb.scale(1, 1.3, 1);
  bulb.translate(0, h * 0.72, 0);
  parts.push(bulb);
  const tip = new THREE.ConeGeometry(r * 0.35, h * 0.35, 8);
  tip.translate(0, h * 1.15, 0);
  parts.push(tip);
  for (let i = 0; i < 3; i++) {
    const disc = new THREE.TorusGeometry(r * (0.9 - i * 0.2), 0.045, 4, 14);
    disc.rotateX(Math.PI / 2);
    disc.translate(0, h * (0.42 + i * 0.13), 0);
    parts.push(disc);
  }
  return mergeGeometries(parts);
}

/**
 * 一座亭：台明 + 柱网 + 额枋斗拱 + 攒尖顶 + 坐凳栏杆。
 * 返回 Group，并把可挂灯的檐下点写进 group.userData.lamps。
 */
export function pavilion({
  sides = 4, radius = 2.6, pillarH = 3.1, roofH = 2.4, tiers = 1,
  plinth = 0.5, roofMat = M.roof, pillarMat = M.pillar, finialH = 1.0,
} = {}) {
  const grp = new THREE.Group();
  const rh = Math.max(roofH, radius * 1.12);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.9, radius + 1.15, plinth, sides * 2), M.stoneDressed);
  plat.position.y = plinth / 2;
  plat.receiveShadow = true;
  grp.add(plat);

  const corners = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    corners.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  const pillarG = pillarGeo(pillarH, 0.15);
  for (const [x, z] of corners) {
    const p = new THREE.Mesh(pillarG, pillarMat);
    p.position.set(x, plinth, z);
    p.castShadow = true;
    grp.add(p);
    const a = Math.atan2(z, x);
    const tie = box(radius * 1.9, 0.2, 0.16, 0, 0, 0);
    tie.rotateY(-a);
    tie.translate(0, plinth + pillarH - 0.12, 0);
    grp.add(mesh(tie, M.beam));
    const br = new THREE.Mesh(bracketGeo(0.6), M.beam);
    br.position.set(x * 0.86, plinth + pillarH, z * 0.86);
    br.rotation.y = -a;
    grp.add(br);
  }
  const eaveY = plinth + pillarH + 0.34;
  // 攒尖要够高才不像飞碟：檐口出挑也收着，否则反曲的下半段会把屋顶摊成一张盘
  const roof = new THREE.Mesh(
    tentedRoof({ sides, radius: radius + 0.42, height: rh, curve: 0.42, lift: 0.62, overhang: 0.24, tiers }),
    roofMat,
  );
  roof.position.y = eaveY;
  roof.castShadow = true;
  roof.receiveShadow = true;
  grp.add(roof);
  const top = new THREE.Mesh(finial(finialH, 0.26), S.gilt);
  top.position.y = eaveY + rh * (tiers > 1 ? 1.36 : 1) + 0.05;
  grp.add(top);

  const rail = railingGeo(radius * 1.72, { height: 0.78, spacing: 0.95 });
  for (let i = 0; i < sides; i++) {
    const a0 = ((i + 0.5) / sides) * Math.PI * 2;
    const a1 = ((i + 1.5) / sides) * Math.PI * 2;
    const mx = (Math.cos(a0) + Math.cos(a1)) / 2 * radius;
    const mz = (Math.sin(a0) + Math.sin(a1)) / 2 * radius;
    const r = new THREE.Mesh(rail, M.stone);
    r.position.set(mx, plinth, mz);
    r.rotation.y = -Math.atan2(mz, mx) + Math.PI / 2;
    grp.add(r);
  }
  grp.userData.lamps = corners.map(([x, z]) => new THREE.Vector3(x * 1.1, eaveY - 0.5, z * 1.1));
  grp.userData.eaveY = eaveY + rh;
  grp.userData.plinth = plinth;
  return grp;
}

/** 一段墙，中间开一个月洞（圆拱门）；墙厚沿 Z */
export function moonDoorWall({ width = 6, height = 4.4, r = 1.5, thickness = 0.5, cx = 0 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 + cx, 0);
  shape.lineTo(width / 2 + cx, 0);
  shape.lineTo(width / 2 + cx, height);
  shape.lineTo(-width / 2 + cx, height);
  shape.closePath();
  const hole = new THREE.Path();
  const y0 = 0.1;
  hole.moveTo(cx - r, y0);
  hole.lineTo(cx - r, y0 + r);
  hole.absarc(cx, y0 + r, r, Math.PI, 0, true);
  hole.lineTo(cx + r, y0);
  hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 22 });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/** 券洞轮廓：矩形门洞上加半圆，用于 ExtrudeGeometry 的 holes */
export function archHole(cx, baseY, halfWidth, topY) {
  const p = new THREE.Path();
  const r = halfWidth;
  const spring = Math.max(baseY, topY - r);
  p.moveTo(cx - r, baseY);
  p.lineTo(cx - r, spring);
  p.absarc(cx, spring, r, Math.PI, 0, true);
  p.lineTo(cx + r, baseY);
  p.closePath();
  return p;
}

/** 单孔拱桥：桥面曲线 + 拱洞，与五亭桥同一套 extrude 做法 */
export function singleArchBridge({ span, width, deckH, archR, deckMat = M.stone }) {
  const shape = new THREE.Shape();
  const hs = span / 2;
  shape.moveTo(-hs, -1.6);
  shape.lineTo(-hs, deckH * 0.32);
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -hs + span * t;
    const y = deckH * 0.32 + (deckH * 0.68) * Math.sin(Math.PI * t) * 0.92 + 0.6;
    shape.lineTo(x, y);
  }
  shape.lineTo(hs, deckH * 0.32);
  shape.lineTo(hs, -1.6);
  shape.closePath();
  const deckTop = deckH + 0.6;
  shape.holes.push(archHole(0, SXH.waterY + 0.15, archR, deckTop - 0.55));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -width / 2);
  const grp = new THREE.Group();
  const body = mesh(g, deckMat);
  body.castShadow = body.receiveShadow = true;
  grp.add(body);
  return grp;
}

/** 阶梯：一段 n 级台阶，沿 +X 上升 */
export function stairGeo(n = 8, tread = 0.42, riseH = 0.22, width = 3.2) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(box(tread, riseH * (i + 1), width, i * tread + tread / 2, riseH * (i + 1) / 2, 0));
  }
  return mergeGeometries(parts);
}

/** 石灯笼 / 灯柱：柱 + 灯室 + 顶，灯火点亮 */
export function lampPost(h = 3.0, color = '#ffc178') {
  const grp = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h, 8), M.stoneDark);
  shaft.position.y = h / 2;
  grp.add(shaft);
  const arm = box(0.9, 0.1, 0.1, 0.4, h, 0);
  grp.add(mesh(arm, M.stoneDark));
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.5, 6), glow(color, 1.5));
  cage.position.set(0.82, h - 0.28, 0);
  grp.add(cage);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 6), M.stone);
  cap.position.set(0.82, h + 0.05, 0);
  grp.add(cap);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,196,124', 0.06), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  halo.scale.set(3.4, 3.4, 1);
  halo.position.set(0.82, h - 0.28, 0);
  grp.add(halo);
  grp.userData.light = new THREE.Vector3(0.82, h - 0.28, 0);
  return grp;
}

/** 叠石：一坨随机压扁的球体群，做假山与驳岸的口气 */
export function rockHeap(seedR = 1) {
  const grp = new THREE.Group();
  const n = 5 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const r = rr(0.5, 1.5) * seedR;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      p.setXYZ(v, p.getX(v) * rr(0.8, 1.3), p.getY(v) * rr(0.45, 0.85), p.getZ(v) * rr(0.8, 1.3));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, S.rock);
    m.position.set(rr(-2, 2) * seedR, r * 0.35, rr(-2, 2) * seedR);
    m.rotation.y = rand() * 6.28;
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  }
  return grp;
}

/** 桃 / 柳：柳用秦淮工程的 willowGeo 骨架，这里只做树冠团 */
export function blossomTree(scale = 1) {
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 2.6, 6), M.beam);
  trunk.position.y = 1.3;
  grp.add(trunk);
  for (let i = 0; i < 5; i++) {
    const r = rr(0.85, 1.5) * scale;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), S.blossom);
    puff.position.set(rr(-1.1, 1.1) * scale, 2.7 + rr(0, 1.2), rr(-1.1, 1.1) * scale);
    puff.castShadow = true;
    grp.add(puff);
  }
  return grp;
}

/** 水面上一枚月影：贴水的加法圆盘，用来"洞洞衔一月" */
export function moonPuddle(radius = 0.85, intensity = 1.15) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#fff2d2').multiplyScalar(intensity), transparent: true, opacity: 0.82,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }),
  );
  m.rotateX(-Math.PI / 2);
  m.renderOrder = 5;
  return m;
}

/**
 * 一间殿宇：台基 + 柱网 + 墙体 + 格窗 + 反曲屋顶 + 鸱吻。
 * lamps/windowGlow 交给灯火系统接管，别在这里自己发光。
 */
export function hall({
  width = 10, depth = 7, height = 4.2, bays = 3, sign = '',
  roofMat = M.roof, wallMat = S.screen, pillarMat = M.pillar, plinth = 0.62, upper = false,
} = {}) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(box(width + 2.4, plinth, depth + 2.4, 0, plinth / 2, 0), M.stoneDressed);
  base.receiveShadow = true;
  grp.add(base);
  grp.add(mesh(stairGeo(4, 0.5, plinth / 4, width * 0.42), M.stoneDressed).translateX(-width * 0.21 - 1.2).translateY(plinth));
  const y0 = plinth;
  const xs = [];
  for (let i = 0; i <= bays; i++) xs.push(-width / 2 + (width * i) / bays);
  const pillar = pillarGeo(height, 0.19);
  for (const x of xs) {
    for (const z of [-depth / 2, depth / 2]) {
      const p = new THREE.Mesh(pillar, pillarMat);
      p.position.set(x, y0, z);
      p.castShadow = true;
      grp.add(p);
    }
    const tie = box(width, 0.24, 0.2, 0, y0 + height - 0.14, 0);
    if (Math.abs(x) === width / 2) {
      const side = box(0.2, 0.24, depth, x, y0 + height - 0.14, 0);
      grp.add(mesh(side, M.beam));
    }
    grp.add(mesh(tie, M.beam));
    const br = new THREE.Mesh(bracketGeo(0.8), M.beam);
    br.position.set(x, y0 + height + 0.06, depth / 2);
    grp.add(br);
    const br2 = br.clone();
    br2.position.z = -depth / 2;
    br2.rotation.y = Math.PI;
    grp.add(br2);
  }
  // 后墙与山墙实心，前面敞开后夹一间格扇
  const back = new THREE.Mesh(box(width, height * 0.94, 0.3, 0, y0 + height * 0.47, -depth / 2 - 0.1), wallMat);
  back.castShadow = back.receiveShadow = true;
  grp.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(box(0.3, height * 0.9, depth, s * (width / 2 + 0.1), y0 + height * 0.45, 0), wallMat);
    grp.add(side);
  }
  const screen = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, height * 0.72, 0.12), new THREE.MeshBasicMaterial({
    map: T.lattice(6, 4), color: 0x8f6f47, toneMapped: false, side: THREE.DoubleSide,
  }));
  screen.position.set(0, y0 + height * 0.42, depth / 2 + 0.06);
  grp.add(screen);
  const roof = new THREE.Mesh(chineseRoof({ width, depth, height: height * 0.62, curve: 0.6, eaveLift: 0.55 }), roofMat);
  roof.position.y = y0 + height + 0.22;
  roof.castShadow = roof.receiveShadow = true;
  grp.add(roof);
  grp.add(mesh(ridgeOrnament({ width, depth, height: height * 0.62 + 0.22 }), M.ridge));
  if (sign) {
    const p = plaqueMesh(sign, width * 0.52, 0.95, { dir: 'h', bg: '#1b2f4d' });
    p.position.set(0, y0 + height * 0.86, depth / 2 + 0.42);
    grp.add(p);
  }
  const lamps = [];
  for (const x of xs) {
    if (Math.abs(x) > width / 2 - 0.2) continue;
    lamps.push(new THREE.Vector3(x, y0 + height - 0.5, depth / 2 + 0.5));
    lamps.push(new THREE.Vector3(x, y0 + height - 0.5, -depth / 2 - 0.5));
  }
  const windows = [];
  for (const s of [-1, 1]) windows.push(new THREE.Vector3(s * width * 0.28, y0 + height * 0.44, depth / 2 + 0.2));
  grp.userData.lamps = lamps;
  grp.userData.windowGlow = windows;
  grp.userData.eaveY = y0 + height + height * 0.62 + 0.3;
  grp.userData.plinth = plinth;
  void upper;
  return grp;
}
