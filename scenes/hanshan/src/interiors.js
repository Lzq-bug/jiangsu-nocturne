/**
 * 室内：殿内三尊佛与长明灯、钟楼二层木地板、客船船舱。
 * 都只做到"看进去像有内容"的程度，夜里镜头停在门口，不必测绘。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, box, mesh, pillarGeo } from './kit.js';
import { LAYOUT } from './architecture.js';
import * as T from './textures.js';

/** 一尊：莲座 + 身 + 头 + 背光 */
function buddhaGeo(scale = 1) {
  const parts = [];
  const throne = new THREE.CylinderGeometry(1.15, 1.35, 0.55, 16);
  throne.translate(0, 0.28, 0);
  parts.push(throne);
  const lotus = new THREE.CylinderGeometry(0.95, 0.7, 0.42, 14);
  lotus.translate(0, 0.76, 0);
  parts.push(lotus);
  for (let i = 0; i < 10; i++) {
    const petal = new THREE.SphereGeometry(0.26, 6, 4);
    petal.scale(1, 0.42, 0.62);
    const a = (i / 10) * Math.PI * 2;
    petal.translate(Math.cos(a) * 0.82, 0.94, Math.sin(a) * 0.82);
    parts.push(petal);
  }
  const body = new THREE.CylinderGeometry(0.46, 0.66, 1.5, 12);
  body.translate(0, 1.72, 0);
  parts.push(body);
  const shoulders = new THREE.SphereGeometry(0.5, 12, 8);
  shoulders.scale(1, 0.7, 0.8);
  shoulders.translate(0, 2.42, 0);
  parts.push(shoulders);
  const head = new THREE.SphereGeometry(0.3, 12, 9);
  head.translate(0, 2.82, 0);
  parts.push(head);
  const topknot = new THREE.SphereGeometry(0.15, 8, 6);
  topknot.translate(0, 3.1, 0);
  parts.push(topknot);
  const arms = new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6);
  arms.rotateZ(Math.PI / 2);
  arms.translate(0, 1.62, 0.42);
  parts.push(arms);
  const g = mergeGeometries(parts);
  g.scale(scale, scale, scale);
  return g;
}

function aureoleGeo(r) {
  const parts = [
    new THREE.TorusGeometry(r, r * 0.075, 8, 26).translate(0, 0, 0),
    new THREE.CircleGeometry(r * 0.94, 24),
  ];
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ 殿内 */
function hallInterior(scene, hl) {
  const g = new THREE.Group();
  const y = hl.floorY;
  // 海墁地砖与天花
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hl.w - 1.2, hl.d - 1.2), M.stoneDark);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(hl.cx, y + 0.03, hl.cz);
  g.add(floor);
  const ceiling = mesh([box(hl.w - 1.0, 0.5, hl.d - 1.0, hl.cx, y + 5.75, hl.cz)], M.beam);
  g.add(ceiling);
  for (let i = 0; i < 3; i++) {
    const coffer = new THREE.Mesh(new THREE.TorusGeometry(1.1 - i * 0.28, 0.07, 6, 20), M.gilt);
    coffer.rotation.x = Math.PI / 2;
    coffer.position.set(hl.cx - 1.0, y + 5.45 - i * 0.16, hl.cz);
    g.add(coffer);
  }
  // 金柱四根
  for (const dx of [-hl.w / 2 + 2.4, hl.w / 2 - 2.4]) {
    for (const dz of [-hl.d / 2 + 2.0, hl.d / 2 - 2.0]) {
      const c = new THREE.Mesh(pillarGeo(5.5, 0.34), M.gilt);
      c.position.set(hl.cx + dx, y, hl.cz + dz);
      g.add(c);
    }
  }
  // 三尊佛：中尊大，两侧略小，全部面朝东（门口）
  const backWall = mesh(box(0.4, 5.0, hl.d - 2.4, hl.cx - hl.w / 2 + 0.9, y + 2.5, hl.cz), M.redWall ?? M.templeWall);
  g.add(backWall);
  const aureoleMat = new THREE.MeshStandardMaterial({ color: 0xd8ab63, roughness: 0.34, metalness: 0.8, emissive: 0x2a1c06, emissiveIntensity: 0.7 });
  for (const [dz, s] of [[0, 1.24], [-3.0, 0.98], [3.0, 0.98]]) {
    const statue = new THREE.Mesh(buddhaGeo(s), M.gilt);
    statue.position.set(hl.cx - hl.w / 2 + 2.6, y + 0.55, hl.cz + dz);
    statue.castShadow = true;
    g.add(statue);
    const au = new THREE.Mesh(aureoleGeo(1.15 * s), aureoleMat);
    au.position.set(hl.cx - hl.w / 2 + 1.9, y + 0.55 + 2.5 * s, hl.cz + dz);
    au.rotation.y = Math.PI / 2;
    g.add(au);
  }
  // 供桌与长明灯
  const table = mesh([
    box(1.5, 0.22, 6.2, hl.cx - hl.w / 2 + 4.3, y + 1.02, hl.cz),
    box(0.24, 1.0, 0.24, hl.cx - hl.w / 2 + 4.3, y + 0.5, hl.cz - 2.7),
    box(0.24, 1.0, 0.24, hl.cx - hl.w / 2 + 4.3, y + 0.5, hl.cz + 2.7),
  ], M.woodDark);
  table.castShadow = true;
  g.add(table);
  const flameMat = glow('#ffcf8a', 2.6);
  const lamps = [];
  for (let i = 0; i < 5; i++) {
    const z = hl.cz - 2.4 + i * 1.2;
    const x = hl.cx - hl.w / 2 + 4.3;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.14, 8), M.gilt);
    cup.position.set(x, y + 1.2, z);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), flameMat);
    flame.position.set(x, y + 1.33, z);
    flame.scale.set(0.7, 1.5, 0.7);
    lamps.push(flame);
    g.add(cup, flame);
  }
  const candleLight = new THREE.PointLight(0xffb066, 26, 15, 2);
  candleLight.position.set(hl.cx - hl.w / 2 + 4.6, y + 1.7, hl.cz);
  g.add(candleLight);
  // 两侧幡幢
  for (const dz of [-hl.d / 2 + 1.6, hl.d / 2 - 1.6]) {
    const mat = new THREE.MeshBasicMaterial({ map: T.banner('佛', { cloth: '#8d2f2a' }), transparent: true, side: THREE.DoubleSide, alphaTest: 0.42 });
    mat.toneMapped = false;
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), mat);
    ban.position.set(hl.cx - 1.2, y + 3.4, hl.cz + dz);
    ban.rotation.y = Math.PI / 2;
    g.add(ban);
    g.add(mesh(box(0.06, 2.2, 0.06, hl.cx - 1.0, y + 1.1, hl.cz + dz), M.woodDark));
  }
  // 香炉：殿门正中，青烟用一小片半透明面代替
  const brazier = mesh([
    new THREE.CylinderGeometry(0.44, 0.3, 0.5, 12).translate(hl.cx + 1.2, y + 0.6, hl.cz),
    box(0.12, 0.5, 0.12, hl.cx + 1.2, y + 0.25, hl.cz),
    new THREE.TorusGeometry(0.46, 0.05, 6, 14).rotateX(Math.PI / 2).translate(hl.cx + 1.2, y + 0.86, hl.cz),
  ], M.bronze);
  brazier.castShadow = true;
  g.add(brazier);
  scene.add(g);
  return {
    group: g,
    update(t) {
      for (let i = 0; i < lamps.length; i++) {
        const f = lamps[i];
        f.scale.set(0.7 + 0.06 * Math.sin(t * 6.2 + i), 1.5 + 0.16 * Math.sin(t * 4.6 + i * 1.7), 0.7 + 0.05 * Math.cos(t * 5.4 + i));
      }
      candleLight.intensity = 24 + 3.2 * Math.sin(t * 5.1) + 1.6 * Math.sin(t * 11.3);
    },
  };
}

/* ------------------------------------------------------------------ 钟楼二层 */
function towerInterior(scene, bl) {
  const g = new THREE.Group();
  const y = bl.deckY;
  const planks = [];
  for (let i = 0; i < 9; i++) planks.push(box(7.0, 0.14, 0.72, bl.cx, y + 0.07, bl.cz - 3.2 + i * 0.8));
  const floor = mesh(planks, M.woodDark);
  floor.receiveShadow = true;
  g.add(floor);
  // 栏下的一圈木地板缝与一盏楼灯
  const lampMat = glow('#ffbe72', 1.7);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lampMat);
  lamp.scale.set(1, 0.84, 1);
  lamp.position.set(bl.cx - 2.6, y + 2.1, bl.cz - 2.8);
  g.add(lamp);
  g.add(mesh([box(0.05, 0.9, 0.05, bl.cx - 2.6, y + 2.7, bl.cz - 2.8)], M.ink));
  const towerLight = new THREE.PointLight(0xffa855, 20, 14, 2);
  towerLight.position.set(bl.cx - 2.4, y + 2.0, bl.cz - 2.4);
  g.add(towerLight);
  scene.add(g);
  return { group: g, lamp, towerLight };
}

/* ------------------------------------------------------------------ 船舱 */
function cabinInterior(scene, boat) {
  const g = new THREE.Group();
  const b = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z);
    boat.worldToLocal(v);
    return v;
  };
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 4.4), M.woodDark);
  const d0 = b(0, 0.86, 0.4);
  deck.rotation.x = -Math.PI / 2;
  deck.position.copy(d0);
  g.add(deck);
  const tray = mesh([box(0.5, 0.06, 0.34, 0, 0.34, 0), box(0.06, 0.34, 0.3, 0, 0.17, 0)], M.beam);
  const tp = b(0, 0.9, -1.0);
  tray.position.copy(tp);
  g.add(tray);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 6), M.stele);
  bowl.scale.set(1, 0.55, 1);
  bowl.position.copy(b(0, 1.28, -1.0));
  g.add(bowl);
  const lampMat = glow('#ffd79b', 2.0);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 6), lampMat);
  cup.position.copy(b(0.3, 1.0, -2.4));
  g.add(cup);
  // 舱里的一床卷着的苫子
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), M.thatch);
  mat.rotation.z = Math.PI / 2;
  mat.position.copy(b(-0.4, 1.02, 1.7));
  g.add(mat);
  scene.add(g);
  return { group: g, cup };
}

export function buildInteriors(scene, boat) {
  const hl = LAYOUT.hall;
  const bl = LAYOUT.bell;
  const hall = hallInterior(scene, hl);
  const tower = towerInterior(scene, bl);
  const cabin = cabinInterior(scene, boat);
  return {
    update(t) { hall.update(t); },
    tower,
    cabin,
  };
}
