import * as THREE from 'three';
import { mergeAll, mesh, lit, glow, rand, rr, box } from './kit.js';
import * as T from './textures.js';
import { CANALS, LAKES, OUTER, BANK, BRIDGES, WALK } from './data.js';
import { lampBatch, haloPoints, floatLamp } from './lamps.js';

/**
 * 夜里的零碎与灯。
 *
 * 规矩是前面定的：亮用发光面与加性光晕假做，照只留给十几盏真实灯。
 * 沿河一串灯笼、几百扇窗、四十几只河灯、湖上几点渔火——全是 MeshBasicMaterial
 * 与 Points，真灯只有街面光池、三桥一盏、各宅门楼那几盏。
 */

/* ------------------------------------------------------------------ 沿河灯 */

function stringLamps(posts) {
  const spots = [];
  for (const [x, z, nx, nz] of posts) {
    spots.push([x, BANK + rr(2.4, 3.1), z, rr(0.22, 0.3)]);
    void nx; void nz;
  }
  const { shells, halos } = lampBatch(spots, { tint: '#ffb877', bright: 1.3 });
  shells.name = 'street-lanterns';
  halos.name = 'street-halos';
  return { shells, halos, spots };
}

/* ------------------------------------------------------------------ 河灯 */

class Floats {
  constructor(scene, count) {
    this.group = new THREE.Group();
    this.group.name = 'river-floats';
    this.items = [];
    const usable = CANALS.filter((c) => c.width >= 10);
    for (let i = 0; i < count; i++) {
      const c = usable[(rand() * usable.length) | 0];
      const [ax, az] = c.path[0], [bx, bz] = c.path[1];
      const len = Math.hypot(bx - ax, bz - az);
      const t = rand();
      const off = (rand() - 0.5) * (c.width * 0.5);
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const m = floatLamp(0, 0, rand() * 6.28);
      m.userData.c = { ax, az, tx, tz, len, off, speed: rr(0.5, 1.5), t };
      this.group.add(m);
      this.items.push(m);
    }
    scene.add(this.group);
  }
  update(t) {
    for (const m of this.items) {
      const u = m.userData.c;
      const s = ((u.t * u.len + t * u.speed) % u.len + u.len) % u.len;
      m.position.set(u.ax + u.tx * s - u.tz * u.off * 0.3, 0.06 + Math.sin(t * 1.6 + u.speed * 4) * 0.03, u.az + u.tz * s + u.tx * u.off * 0.3);
      m.rotation.y = Math.atan2(-u.tz, u.tx) + Math.sin(t * 0.8 + u.speed * 3) * 0.2;
    }
  }
  set visible(v) { this.group.visible = v; }
}

/* ------------------------------------------------------------------ 渔火与远村 */

function distantLights(scene) {
  const spots = [];
  for (const s of LAKES.sectors) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      spots.push([s.x + rr(-260, 260), rr(1.2, 4.5), s.z + rr(-240, 240), rr(2.4, 4.6)]);
    }
  }
  for (const v of OUTER.villages) {
    for (let i = 0; i < v.n; i++) {
      spots.push([v.x + rr(-120, 120), rr(1.6, 6.5), v.z + rr(-110, 110), rr(1.8, 3.4)]);
    }
  }
  const p = haloPoints(spots, '#ffcf96');
  p.name = 'distant-lights';
  p.material.uniforms.uStrength.value = 0.8;
  scene.add(p);
  return p;
}

/* ------------------------------------------------------------------ 主入口 */

export function buildProps(scene, { land, houses }) {
  const group = new THREE.Group();
  group.name = 'props';

  const strings = stringLamps(land.lampPosts);
  group.add(strings.shells);
  group.add(strings.halos);

  const floats = new Floats(scene, 44);
  const distant = distantLights(scene);

  /* ---- 河埠头旁的一只石灯柱：贴着水，是夜里最好认的一点 */
  const posts = [];
  for (const w of land.wharves) {
    if (rand() > 0.5) continue;
    const g = new THREE.CylinderGeometry(0.11, 0.14, 1.9, 7);
    g.translate(w.x + Math.cos(w.dir) * 1.6, BANK - 0.6, w.z + Math.sin(w.dir) * 1.6);
    posts.push(g);
    const cage = new THREE.SphereGeometry(0.2, 7, 6);
    cage.scale(1, 1.25, 1);
    cage.translate(w.x + Math.cos(w.dir) * 1.6, BANK + 0.75, w.z + Math.sin(w.dir) * 1.6);
    posts.push(cage);
  }
  if (posts.length) {
    const m = mesh(mergeAll(posts), glow('#ffc07c', 1.1));
    m.name = 'wharf-posts';
    group.add(m);
  }

  /* ---- 三桥边的一座桥亭：走三桥的歇脚处，形制写意 */
  const pav = bridgePavilion();
  const t3 = BRIDGES.find((b) => b.id === WALK[2]);
  pav.position.set(t3.at[0] + 12, BANK, t3.at[1] - 12);
  pav.rotation.y = -Math.PI / 4;
  group.add(pav);

  scene.add(group);

  /* ---- 参数与状态 */
  let lampK = 1;

  return {
    group, floats, distant, strings,
    /** 水面光柱的落位：沿河灯、埠头石灯、桥亭 */
    waterLamps: strings.spots.map(([x, , z]) => [x, z])
      .concat(land.wharves.map((w) => [w.x, w.z]))
      .concat([[pav.position.x, pav.position.z]]),
    realLights: [
      // 街面的光池：四个片区各一盏，压低角度照石板
      { x: -180, y: BANK + 3.4, z: 34, i: 330, d: 26, c: '#ffbf8e' },
      { x: 120, y: BANK + 3.4, z: 34, i: 330, d: 26, c: '#ffbf8e' },
      { x: -60, y: BANK + 3.2, z: -232, i: 280, d: 24, c: '#ffc894' },
      { x: 240, y: BANK + 3.2, z: -160, i: 260, d: 22, c: '#ffcb98' },
      { x: -60, y: BANK + 3.4, z: 250, i: 250, d: 22, c: '#ffcb98' },
      // 三桥那一片：桥身与水面一起亮
      { x: 40, y: BANK + 4.2, z: 20, i: 460, d: 34, c: '#ffd0a0' },
      // 罗星洲的渡口对岸：给湖一个尽头
      { x: 470, y: BANK + 3.0, z: 300, i: 240, d: 24, c: '#ffcf9a' },
    ],
    setLamp(v) {
      lampK = v;
      strings.shells.material = glow('#ffb877', 0.35 + 1.15 * v);
      strings.halos.material.uniforms.uStrength.value = 0.22 + 0.9 * v;
      pav.userData.setLamp && pav.userData.setLamp(v);
    },
    setWindow(v) {
      houses.setWindow(v);
    },
    setFloat(v) {
      floats.visible = v > 0.02;
      floats.group.scale.setScalar(0.7 + 0.5 * v);
    },
    update(t) {
      floats.update(t);
      distant.material.uniforms.uStrength.value = (0.55 + 0.25 * Math.sin(t * 0.7)) * (0.3 + 0.7 * lampK);
    },
  };
}

/** 桥亭：四柱一顶一座台，走三桥的人在这里歇 */
function bridgePavilion() {
  const grp = new THREE.Group();
  grp.name = 'bridge-pavilion';
  const wood = [], stone = [], tile = [], litP = [];
  const half = 2.1, h = 3.0;
  stone.push(box(half * 2 + 1.8, 0.45, half * 2 + 1.8, 0, 0, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wood.push(new THREE.CylinderGeometry(0.13, 0.11, h, 8).translate(sx * half, 0.45 + h / 2, sz * half));
    }
  }
  for (const sz of [-1, 1]) wood.push(box(half * 2, 0.42, 0.12, 0, 0.9, sz * half));
  const roof = new THREE.ConeGeometry(half + 1.35, 1.75, 4, 1, false);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 0.45 + h + 0.85, 0);
  tile.push(roof);
  const finial = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6);
  finial.translate(0, 0.45 + h + 1.9, 0);
  stone.push(finial);
  const lamp = new THREE.SphereGeometry(0.24, 8, 6);
  lamp.scale(1, 1.3, 1);
  lamp.translate(0, 0.45 + h - 0.5, 0);
  litP.push(lamp);
  grp.add(mesh(mergeAll(stone), lit('#8b9298', { map: T.paving({ meters: 1.4 }), rough: 0.9 })));
  grp.add(mesh(mergeAll(wood), lit('#4b3a2e', { rough: 0.76, emissive: '#20140a', ei: 0.22 })));
  grp.add(mesh(mergeAll(tile), lit('#41505f', { map: T.tiles({ meters: 1.0 }), rough: 0.72, side: THREE.DoubleSide, emissive: '#1b2836', ei: 0.32 })));
  const lampMesh = mesh(mergeAll(litP), glow('#ffbf7e', 1.3));
  lampMesh.name = 'pavilion-lamp';
  grp.add(lampMesh);
  const halo = haloPoints([[0, 0.45 + h - 0.5, 0, 3.2]], '#ffc07c');
  halo.name = 'pavilion-halo';
  grp.add(halo);
  grp.userData.setLamp = (v) => {
    lampMesh.material = glow('#ffbf7e', 0.4 + 1.1 * v);
    halo.material.uniforms.uStrength.value = 0.2 + 0.9 * v;
  };
  return grp;
}
