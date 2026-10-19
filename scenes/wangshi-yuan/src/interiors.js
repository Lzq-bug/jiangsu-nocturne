/**
 * 室内：三处厅堂做到"推门进去像有内容"——案几、椅、太师壁、一轴字、一盏灯。
 * 夜里镜头停在门口，不必测绘，也不摆现代设备。
 */
import * as THREE from 'three';
import { M, glow, box, mesh, pillarGeo, plaqueMesh } from './kit.js';
import { LAYOUT } from './architecture.js';
import { DECK } from './data.js';
import * as T from './textures.js';

const D = DECK;

function lampOn(x, y, z, scene, parent, intensity = 18) {
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.2, 9), new THREE.MeshStandardMaterial({
    map: T.lanternPaper('#fff0cd', '#d1502f'), roughness: 0.6,
    emissive: new THREE.Color('#ff9a4e'), emissiveIntensity: 1.3,
  }));
  cup.position.set(x, y, z);
  const light = new THREE.PointLight(0xffb066, intensity, 11, 2);
  light.position.set(x, y + 0.3, z);
  parent.add(cup, light);
  scene.add(light);
  return { cup, light, y };
}

function tableGeoParts({ x, y, z, w = 1.8, d = 0.72, h = 0.78 }) {
  return [
    box(w, 0.1, d, x, y + h, z),
    box(0.12, h, 0.12, x - w / 2 + 0.12, y + h / 2, z - d / 2 + 0.12),
    box(0.12, h, 0.12, x + w / 2 - 0.12, y + h / 2, z - d / 2 + 0.12),
    box(0.12, h, 0.12, x - w / 2 + 0.12, y + h / 2, z + d / 2 - 0.12),
    box(0.12, h, 0.12, x + w / 2 - 0.12, y + h / 2, z + d / 2 - 0.12),
  ];
}

function chair({ x, y, z, rot = 0 }) {
  const g = new THREE.Group();
  g.add(mesh([
    box(0.44, 0.08, 0.42, 0, 0.44, 0),
    box(0.06, 0.7, 0.06, -0.19, 0.22, -0.17),
    box(0.06, 0.7, 0.06, 0.19, 0.22, -0.17),
    box(0.06, 0.7, 0.06, -0.19, 0.28, 0.17),
    box(0.06, 0.7, 0.06, 0.19, 0.28, 0.17),
    box(0.44, 0.56, 0.06, 0, 0.74, -0.18),
  ], M.woodDark));
  g.position.set(x, y, z);
  g.rotation.y = rot;
  return g;
}

/** 大厅内景：太师壁居中，前后开间摆桌椅，檐柱四根 */
function mainHall(scene, b, { name, insideText, faceSign = 's' }) {
  const g = new THREE.Group();
  const y = D;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 1.4, b.d - 1.4), M.stoneDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(b.cx, y + 0.04, b.cz);
  g.add(floor);
  g.add(mesh([box(b.w - 1.0, 0.4, b.d - 1.0, b.cx, b.eaveY + 0.1, b.cz)], M.beam));

  // 太师壁立在背对明间的那一侧
  const back = faceSign === 's' ? -1 : 1;
  const bx = b.cx, bz = b.cz + back * (b.d / 2 - 0.9);
  g.add(mesh([box(b.w * 0.62, 3.0, 0.3, bx, y + 1.5, bz)], M.wall));
  const screen = plaqueMesh(insideText, Math.min(2.4, b.w * 0.34), 1.2, { dir: 'h', bg: '#1b2a38', fg: '#f0dcb0' });
  screen.position.set(bx, y + 2.0, bz - back * 0.25);
  screen.rotation.y = back > 0 ? Math.PI : 0;
  g.add(screen);

  // 檐柱四根
  for (const dx of [-b.w / 2 + 2.2, b.w / 2 - 2.2]) {
    for (const dz of [-b.d / 2 + 1.6, b.d / 2 - 1.6]) {
      const c = new THREE.Mesh(pillarGeo(3.3, 0.24), M.woodDark);
      c.position.set(b.cx + dx, y, b.cz + dz);
      g.add(c);
    }
  }
  // 一桌两椅与茶几
  const tz = b.cz + back * 1.0;
  g.add(mesh(tableGeoParts({ x: b.cx, y, z: tz, w: 2.0, d: 0.8 }), M.lacquer));
  g.add(chair({ x: b.cx - 1.3, y, z: tz, rot: Math.PI / 2 }));
  g.add(chair({ x: b.cx + 1.3, y, z: tz, rot: -Math.PI / 2 }));
  g.add(mesh(tableGeoParts({ x: b.cx - b.w / 2 + 2.0, y, z: b.cz, w: 0.8, d: 0.6, h: 0.86 }), M.woodDark));
  // 瓶与镜：厅堂上"平静"的谐音摆设
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.44, 10), M.stele);
  vase.position.set(b.cx - b.w / 2 + 2.0, y + 1.08, b.cz);
  g.add(vase);
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshStandardMaterial({ color: 0xb9c4d2, roughness: 0.18, metalness: 0.9 }));
  mirror.position.set(b.cx + b.w / 2 - 2.0, y + 1.5, b.cz);
  mirror.rotation.y = Math.PI / 2;
  g.add(mirror);
  g.add(mesh(tableGeoParts({ x: b.cx + b.w / 2 - 2.0, y, z: b.cz, w: 0.8, d: 0.6, h: 0.9 }), M.woodDark));

  const lamps = [
    lampOn(b.cx - 1.0, y + 1.5, b.cz - back * (b.d / 2 - 1.2), scene, g, 16),
    lampOn(b.cx + 1.0, y + 1.5, b.cz - back * (b.d / 2 - 1.2), scene, g, 16),
  ];
  scene.add(g);
  return {
    group: g,
    update(t) {
      for (const l of lamps) l.light.intensity = 14 + 2.4 * Math.sin(t * 4.7 + l.y) + 1.2 * Math.sin(t * 9.3);
    },
  };
}

/** 书斋内景：条案、盆景、一轴字、一盏灯 */
function study(scene, b, { couplet }) {
  const g = new THREE.Group();
  const y = D;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 1.2, b.d - 1.2), M.stoneDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(b.cx, y + 0.04, b.cz);
  g.add(floor);
  g.add(mesh([box(b.w - 0.9, 0.34, b.d - 0.9, b.cx, b.eaveY + 0.05, b.cz)], M.beam));

  const deskZ = b.cz - 0.6;
  g.add(mesh(tableGeoParts({ x: b.cx, y, z: deskZ, w: 2.4, d: 0.78, h: 0.8 }), M.woodDark));
  // 案上：笔山、砚、书两册、一瓶
  const items = [];
  items.push(box(0.34, 0.05, 0.12, b.cx - 0.7, y + 0.86, deskZ));
  items.push(box(0.26, 0.05, 0.18, b.cx + 0.2, y + 0.86, deskZ));
  for (let i = 0; i < 3; i++) items.push(box(0.3, 0.05, 0.22, b.cx - 0.1 + i * 0.02, y + 0.86 + i * 0.05, deskZ + 0.28));
  g.add(mesh(items, M.stele));
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.3, 9), M.stone);
  pot.position.set(b.cx + 0.95, y + 0.95, deskZ);
  g.add(pot);
  const leafM = new THREE.MeshBasicMaterial({ map: T.leafBlob('#3f5a44'), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  leafM.toneMapped = false;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.leafBlob('#3f5a44'), transparent: true, depthWrite: false }));
    s.position.set(b.cx + 0.95 + (i - 1) * 0.14, y + 1.3 + i * 0.05, deskZ);
    s.scale.setScalar(0.5);
    g.add(s);
  }
  void leafM;
  g.add(chair({ x: b.cx, y, z: deskZ + 1.1, rot: Math.PI }));

  // 壁上字：楹联的一半挂在案后
  const hanging = plaqueMesh(couplet, 0.9, 2.2, { dir: 'v', bg: '#efe6cf', fg: '#2b2f3a', border: '#8a7a5c' });
  hanging.position.set(b.cx, y + 1.9, b.cz - b.d / 2 + 0.42);
  g.add(hanging);
  const lamp = lampOn(b.cx - 1.4, y + 1.35, deskZ + 0.2, scene, g, 15);
  scene.add(g);
  return {
    group: g,
    update(t) { lamp.light.intensity = 13 + 2.2 * Math.sin(t * 5.3) + 1.1 * Math.sin(t * 11.1); },
  };
}

/** 水阁内景：临池一面全敞，桌凳面朝水面，灯影落进池里 */
function waterside(scene, b) {
  const g = new THREE.Group();
  const y = D;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 1.2, b.d - 1.2), M.woodDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(b.cx, y + 0.05, b.cz);
  g.add(floor);
  g.add(mesh([box(b.w - 0.8, 0.34, b.d - 0.8, b.cx, b.eaveY + 0.05, b.cz)], M.beam));
  // 敞向池子的一面：栏杆与半启的格扇
  const openZ = b.cz - b.d / 2 - 0.1;
  for (let i = 0; i <= 4; i++) {
    g.add(mesh([box(0.12, 0.9, 0.12, b.cx - b.w / 2 + 1.0 + i * (b.w - 2.0) / 4, y + 0.45, openZ)], M.woodDark));
  }
  g.add(mesh([box(b.w - 1.8, 0.1, 0.16, b.cx, y + 0.92, openZ)], M.woodDark));
  const tz = b.cz + 0.4;
  g.add(mesh(tableGeoParts({ x: b.cx, y, z: tz, w: 2.2, d: 0.82 }), M.lacquer));
  for (const dx of [-1.4, -0.5, 0.5, 1.4]) g.add(chair({ x: b.cx + dx, y, z: tz + 1.0, rot: Math.PI }));
  const lamp = lampOn(b.cx, y + 1.5, tz - 0.9, scene, g, 20);
  const glow2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow('#ffcf8a', 2.2));
  glow2.position.set(b.cx, y + 1.44, tz - 0.9);
  g.add(glow2);
  scene.add(g);
  return {
    group: g,
    update(t) { lamp.light.intensity = 18 + 3.0 * Math.sin(t * 4.1) + 1.4 * Math.sin(t * 9.7); },
  };
}

export function buildInteriors(scene) {
  const rooms = {
    juanshuitang: mainHall(scene, LAYOUT.juanshuitang, { name: '万卷堂', insideText: '万卷堂', faceSign: 's' }),
    dianshun: study(scene, LAYOUT.dianshun, { couplet: '巢安翡翠春云暖' }),
    yanying: waterside(scene, LAYOUT.yanying),
  };
  return {
    rooms,
    update(t) {
      for (const r of Object.values(rooms)) r.update(t);
    },
  };
}
