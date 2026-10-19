/**
 * 露天老子铜像：本景主景。
 *
 * 可考的尺只有一套净高：像 33 米、坐像法身 28 米、基座直径 18.8 米、重 106 吨、
 * 226 块特制紫铜板铆焊、1996 动工 1998 落成、2000 年获吉尼斯纪录；座下是老君殿，
 * 身后贴山壁建 120 米东西向文化长廊，两侧为玉皇殿、王母殿，赵朴初题"道法自然"。
 * 面相、衣纹与手的姿势查不到形制记载，按常见的老子坐像做写意，帮助面板里已注明；
 * "81 米／33.33 米／取意八十一章／朝向／设计者"无据，模型与文案都不采用。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, lit, mesh, box, chineseRoof, pillarGeo, plaqueMesh, registerOccluder, rand } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import * as T from './textures.js';
import { LAOZI } from './data.js';
import { padTop } from './relief.js';
import { hall } from './buildings.js';

const scaled = (geo, sx, sy, sz, x = 0, y = 0, z = 0) => {
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return geo;
};

/** 坐像法身：盘坐 → 躯干 → 肩 → 头 → 冠，合计 28 米（含莲台以上） */
function figureGeo() {
  const parts = [];
  const seatH = 5.2;
  // 盘坐的下盘：两膝外鼓，中间收
  parts.push(scaled(new THREE.SphereGeometry(1, 16, 12), 6.6, seatH * 0.52, 4.1, 0, seatH * 0.42, 0.2));
  parts.push(scaled(new THREE.SphereGeometry(1, 14, 10), 3.1, 1.7, 2.5, -5.4, seatH * 0.36, 0.6));
  parts.push(scaled(new THREE.SphereGeometry(1, 14, 10), 3.1, 1.7, 2.5, 5.4, seatH * 0.36, 0.6));
  // 足与裙摆压在下盘前缘
  parts.push(scaled(new THREE.SphereGeometry(1, 14, 10), 3.4, 1.2, 1.5, 0, seatH * 0.26, 2.9));
  // 躯干：自腰到肩一段段收分
  const torso = [];
  const levels = [[seatH - 0.4, 4.5], [seatH + 3, 4.7], [seatH + 8, 4.35], [seatH + 12.5, 3.8], [seatH + 15.4, 3.2]];
  for (let i = 0; i < levels.length - 1; i++) {
    const [y0, r0] = levels[i], [y1, r1] = levels[i + 1];
    const seg = new THREE.CylinderGeometry(r1, r0, y1 - y0, 18, 1, false);
    seg.translate(0, (y0 + y1) / 2, 0.3);
    torso.push(seg);
  }
  parts.push(...torso);
  // 袍袖：两臂自肩垂到膝，双手在腹前捧如意
  for (const s of [-1, 1]) {
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 3.1, seatH + 14.6, 0.6),
      new THREE.Vector3(s * 5.1, seatH + 10.4, 1.6),
      new THREE.Vector3(s * 4.3, seatH + 5.4, 2.7),
      new THREE.Vector3(s * 1.3, seatH + 3.6, 3.2),
    ]);
    parts.push(new THREE.TubeGeometry(arm, 14, 1.45, 9, false));
  }
  parts.push(scaled(new THREE.SphereGeometry(1, 12, 9), 2.3, 1.2, 1.3, 0, seatH + 3.7, 3.35));
  // 颈、头、颌、额
  parts.push(scaled(new THREE.CylinderGeometry(1.25, 1.5, 2.0, 14), 1, 1, 1, 0, seatH + 16.6, 0.35));
  const headY = seatH + 19.2;
  parts.push(scaled(new THREE.SphereGeometry(1, 18, 14), 2.35, 2.75, 2.4, 0, headY, 0.3));
  parts.push(scaled(new THREE.SphereGeometry(1, 14, 10), 1.85, 1.5, 1.7, 0, headY - 1.15, 1.05));
  // 长耳（老子"耳长"是形征，写意给一点）
  for (const s of [-1, 1]) parts.push(scaled(new THREE.SphereGeometry(1, 10, 8), 0.42, 1.35, 0.6, s * 2.25, headY - 0.4, 0.2));
  // 顶髻与冠
  parts.push(scaled(new THREE.SphereGeometry(1, 12, 9), 1.15, 1.0, 1.15, 0, headY + 2.55, 0.15));
  parts.push(scaled(new THREE.CylinderGeometry(1.05, 1.25, 1.3, 12), 1, 1, 1, 0, headY + 3.4, 0.15));
  // 须：自颌垂到胸前
  parts.push(scaled(new THREE.ConeGeometry(0.85, 5.2, 8), 1, 1, 1, 0, headY - 4.4, 1.95));
  // 衣纹：三道宽带绕身
  for (const [y, r] of [[seatH + 5.2, 4.6], [seatH + 10.4, 4.3], [seatH + 14.2, 3.6]]) {
    const ring = new THREE.TorusGeometry(r, 0.34, 6, 22);
    ring.rotateX(Math.PI / 2 - 0.12);
    ring.translate(0, y, 0.35);
    parts.push(ring);
  }
  return mergeGeometries(parts);
}

/** 莲台：双层仰莲，一瓣瓣排出来 */
function lotusGeo(r) {
  const parts = [];
  const disc = new THREE.CylinderGeometry(r * 0.96, r * 0.8, 1.6, 28, 1);
  disc.translate(0, 0.8, 0);
  parts.push(disc);
  for (const [tier, rr2, tilt, y] of [[0, r, 0.62, 1.5], [1, r * 0.82, 0.42, 2.6]]) {
    const n = tier === 0 ? 18 : 15;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tier * 0.16;
      const petal = scaled(new THREE.SphereGeometry(1, 10, 8), 0.95, 2.3, 0.42, 0, 1.15, 0);
      const pivot = new THREE.Matrix4();
      pivot.makeRotationZ(-tilt);
      petal.applyMatrix4(pivot);
      const spin = new THREE.Matrix4().makeRotationY(a);
      petal.applyMatrix4(spin);
      petal.translate(Math.sin(a) * rr2 * 0.86, y, Math.cos(a) * rr2 * 0.86);
      parts.push(petal);
    }
  }
  return mergeGeometries(parts);
}

/** 基座：圆台 + 一圈壁柱 + 南向三踏，座下即老君殿（不计入像净高 33 米） */
function podiumGeo(d, h) {
  const r = d / 2;
  const parts = [];
  parts.push(new THREE.CylinderGeometry(r, r * 1.06, h, 36, 1).translate(0, h / 2, 0));
  parts.push(new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.5, 36, 1).translate(0, h + 0.25, 0));
  parts.push(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.42, 36, 1).translate(0, h * 0.52, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = box(0.9, h - 0.8, 0.85, 0, h / 2, r);
    p.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    parts.push(p);
  }
  for (let i = 0; i < 3; i++) parts.push(box(9 - i * 2.2, 1.1, 2.6, 0, 0.55 + i * 1.05, r + 1.4 + i * 2.4));
  return mergeGeometries(parts);
}

function buildGallery(site) {
  // 身后贴山壁的 120 米东西向文化长廊：列柱 + 墙身 + 屋顶，墙上是分段的壁面灯
  const g = new THREE.Group();
  const len = site.gallery.len, h = site.gallery.h;
  const back = mesh(box(len, h, 1.2, 0, h / 2, -1.6), lit('#7e8795', { map: TX.stone('#6d7583'), rough: 0.94, emissive: '#12161d', ei: 0.34 }));
  g.add(back);
  const seg = 11;
  for (let i = 0; i < seg; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / seg;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry((len / seg) * 0.74, h * 0.56),
      new THREE.MeshBasicMaterial({ map: TX.lattice(4, 3, '#3b2a18', '#ffcf92'), toneMapped: false, transparent: true, opacity: 0.9 }));
    panel.position.set(x, h * 0.46, -0.9);
    g.add(panel);
    const c = new THREE.Mesh(pillarGeo(h, 0.34), M.pillar);
    c.position.set(-len / 2 + (len * i) / seg, 0, 1.3);
    g.add(c);
  }
  const roof = new THREE.Mesh(chineseRoof({ width: len + 2, depth: 5.2, height: 1.8, ridgeRatio: 0.98, curve: 0.55, eaveLift: 0.4, segU: 60, segV: 10 }), M.roof);
  roof.position.y = h;
  g.add(roof);
  g.position.set(site.x, padTop(site.pad), site.z + site.gallery.dz);
  return g;
}

export function buildLaozi(scene, anchors = {}) {
  const grp = new THREE.Group();
  const y0 = padTop(LAOZI.pad);
  const bronze = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c08a54'), map: T.bronzePanels(),
    roughness: 0.44, metalness: 0.82,
    emissive: new THREE.Color('#2a1608'), emissiveIntensity: 0.55,
  });

  const pod = new THREE.Mesh(podiumGeo(LAOZI.podiumD, LAOZI.podiumH),
    lit('#a8aeb9', { map: TX.stone('#8a909c'), rough: 0.9, emissive: '#0e1218', ei: 0.32 }));
  pod.position.set(0, 0, 0);
  grp.add(pod);

  const lotus = new THREE.Mesh(lotusGeo(LAOZI.podiumD * 0.46),
    lit('#caa25f', { roughness: 0.5, metalness: 0.7, emissive: new THREE.Color('#2b1a08'), emissiveIntensity: 0.6 }));
  lotus.position.y = LAOZI.podiumH;
  grp.add(lotus);

  // 像净高 33 米 = 莲台 + 法身（法身 28 米一说），基座另计
  const fig = new THREE.Mesh(figureGeo(), bronze);
  fig.position.y = LAOZI.podiumH + LAOZI.lotusH;
  grp.add(fig);

  // 座下老君殿的门面与"道法自然"额
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.6), glow('#ffbe72', 0.7));
  door.position.set(0, 2.6, LAOZI.podiumD / 2 + 3.6);
  grp.add(door);
  const motto = plaqueMesh('道法自然', 7.2, 2, { bg: '#1d232c', fg: '#f6dcaa', dir: 'h' });
  motto.position.set(0, 5.9, LAOZI.podiumD / 2 + 3.9);
  grp.add(motto);

  grp.position.set(LAOZI.x, y0, LAOZI.z);
  grp.rotation.y = LAOZI.facing;
  scene.add(registerOccluder(grp, 14, new THREE.Vector3(LAOZI.x, 0, LAOZI.z)));

  // 两侧玉皇殿、王母殿（名可考，形制写意）
  for (const f of LAOZI.flanks) {
    const b = hall({ w: 11, d: 7.4, h: 6.4, bays: 3, name: f.name }, { palette: 'gray' });
    b.position.set(LAOZI.x + f.dx, y0, LAOZI.z + 6);
    scene.add(b);
  }
  scene.add(buildGallery(LAOZI));

  // 像前的拜坛与长明灯位
  const altar = mesh(box(7, 1.1, 3.4, 0, 0.55, 0), M.stoneDressed);
  altar.position.set(LAOZI.x, y0, LAOZI.z + 15);
  scene.add(altar);
  anchors.laozi = { x: LAOZI.x, y: y0 + LAOZI.podiumH + LAOZI.totalH, z: LAOZI.z, base: y0 };
  anchors.laoziFeet = [LAOZI.x, y0 + LAOZI.podiumH + 1.2, LAOZI.z];
  anchors.lampRing = Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI * (0.12 + 0.76 * (i / 9));
    return [LAOZI.x + Math.sin(a) * 14, y0 + 0.9, LAOZI.z + Math.cos(a) * 14];
  });
  return { grp, bronze, figure: fig };
}
