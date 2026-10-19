import * as THREE from 'three';
import { mergeAll, mesh, lit, rand, meterBox, pathFrames } from './kit.js';
import * as T from './textures.js';
import { RESERVE, BANK } from './data.js';
import { hallOf, towerOf } from './garden.js';
import { wallCap } from './roofs.js';
import { lampBatch, plaque } from './lamps.js';

/**
 * 镇内可名的几处大宅：崇本堂、嘉荫堂、耕乐堂、百尺梧桐（陈去病故居）。
 *
 * 可核的是名目、年代、面积与几条营造上的数：崇本堂五柱计十四头、九界梁、六架椽，
 * 面积 2088 平米（另有 1644 一说）；嘉荫堂明间作船篷轩、拱眼雕鲤鱼跳龙门、800 平米、
 * 1999 年迁建；耕乐堂明天顺六年（1457）始建、前后两进、后进五楼、硬山、692 平米、
 * 2006 年列国保；百尺梧桐的陈去病故居西屋是一座曲尺形上下两层楼。
 * 门楼砖雕的纹样、天井的铺法、堂里的陈设都是按江南大宅通例补配的写意。
 *
 * 这一处的夜戏只有一件事：门楼。砖雕是要斜着打光才肯露层次的，
 * 所以每宅一盏低角度的暖光扫过门罩，正面留暗——这是这几栋屋里唯一
 * 刻意做出来的光。
 */

const BRICK = lit('#8a8074', { map: T.paving({ meters: 0.9, base: '#7f7669' }), rough: 0.92, side: THREE.DoubleSide });
const CARVED = lit('#948a7c', { map: T.steleWall({ meters: 0.95, cols: 4, rows: 3 }), rough: 0.9, side: THREE.DoubleSide, emissive: '#191309', ei: 0.22 });
const PLASTER = lit('#c3ccc9', { map: T.plaster({ meters: 2.4, base: '#c9d1cd' }), rough: 0.94, side: THREE.DoubleSide });
const TILE = lit('#41505f', { map: T.tiles({ meters: 1.05, base: '#35424f' }), rough: 0.7, side: THREE.DoubleSide, emissive: '#1b2836', ei: 0.32 });
const PAVE = lit('#6f7880', { map: T.paving({ meters: 1.15, base: '#666f77' }), rough: 0.94 });
const WOOD = lit('#4b3a2e', { rough: 0.75, emissive: '#20140a', ei: 0.22 });

/** 一段墙（含墙帽），两端点给世界坐标 */
function wall(from, to, h, parts, caps, { thick = 0.42, capWidth = 1.1 } = {}) {
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const rot = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  const g = meterBox(L, h, thick, 0, 0, 0);
  g.rotateY(rot);
  g.translate((from[0] + to[0]) / 2, BANK, (from[1] + to[1]) / 2);
  parts.push(g);
  const f = pathFrames([[from[0], 0, from[1]], [to[0], 0, to[1]]], { steps: 5 });
  caps.push(wallCap(
    { pts: f.pts.map((p) => new THREE.Vector3(p.x, BANK + h, p.z)), right: f.right, dist: f.dist, length: f.length },
    { width: capWidth, rise: 0.4, eaveDrop: 0.18 },
  ));
}

/**
 * 砖雕门楼：两个砖垛、一道门罩、上面一层砖雕与额匾，再压一条瓦顶。
 * 门洞是黑的，光从侧面来——额上的字要走近才读得出。
 */
function gatehouse({ x, z, rot, name, w = 4.2, h = 4.4 }) {
  const grp = new THREE.Group();
  const brick = [], carved = [], tile = [];
  const half = w / 2, opening = 1.45;
  for (const sx of [-1, 1]) brick.push(meterBox(0.62, h, 0.66, sx * (half - 0.31), 0, 0));
  // 门枕与门槛
  brick.push(meterBox(w, 0.22, 0.7, 0, 0, 0));
  for (let k = 0; k < 3; k++) brick.push(meterBox(w + 0.5 - k * 0.24, 0.2, 0.24, 0, 0.22 + k * 0.2, 0.42 + k * 0.26));
  // 门罩：三层叠线 + 一层砖雕 + 额
  const lintelY = h;
  carved.push(meterBox(w + 0.9, 0.26, 0.8, 0, lintelY, 0));
  carved.push(meterBox(w + 0.6, 0.34, 0.76, 0, lintelY + 0.3, 0));
  carved.push(meterBox(w + 0.3, 1.15, 0.7, 0, lintelY + 0.66, 0));
  const roofParts = [];
  const rp = new THREE.BoxGeometry(w + 1.6, 0.24, 1.5);
  rp.translate(0, lintelY + 1.9, 0.05);
  roofParts.push(rp);
  tile.push(mergeAll(roofParts));
  grp.add(mesh(mergeAll(brick), BRICK));
  grp.add(mesh(mergeAll(carved), CARVED));
  grp.add(mesh(mergeAll(tile), TILE));
  const sign = plaque(name, Math.min(2.2, w - 1.1), 0.56, { board: '#4b4239', glowTint: '#ffd6a8', ei: 0.5 });
  sign.position.set(0, lintelY + 1.2, 0.46);
  grp.add(sign);
  // 门扇：两扇板门，闭着
  const doors = [];
  for (const sx of [-1, 1]) doors.push(meterBox(opening - 0.06, h - 0.5, 0.12, sx * opening / 2, 0.22, -0.1));
  grp.add(mesh(mergeAll(doors), WOOD));
  grp.position.set(x, BANK, z);
  grp.rotation.y = rot;
  return grp;
}

/** 一宅：门楼在前、天井居中、大厅在后，再往后是楼 */
function compound(scene, spec) {
  const p = spec.plot;
  const cx = (p.x0 + p.x1) / 2;
  const group = new THREE.Group();
  group.name = `compound-${spec.id}`;
  const walls = [], caps = [];
  const depth = p.z1 - p.z0, width = p.x1 - p.x0;

  // 三面围墙，南面留门楼
  wall([p.x0, p.z0], [p.x1, p.z0], 3.6, walls, caps);                 // 北
  wall([p.x0, p.z0], [p.x0, p.z1], 3.6, walls, caps);                 // 西
  wall([p.x1, p.z0], [p.x1, p.z1], 3.6, walls, caps);                 // 东
  const gateW = 4.4;
  wall([p.x0, p.z1], [cx - gateW / 2, p.z1], 3.4, walls, caps);
  wall([cx + gateW / 2, p.z1], [p.x1, p.z1], 3.4, walls, caps);
  group.add(mesh(mergeAll(walls), PLASTER));
  group.add(mesh(mergeAll(caps), TILE));

  group.add(gatehouse({ x: cx, z: p.z1, rot: 0, name: spec.name, w: gateW }));

  // 天井：门楼到厅前的一片铺地
  const courtDepth = Math.min(11, depth * 0.36);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(width - 1.2, courtDepth), PAVE);
  court.rotation.x = -Math.PI / 2;
  court.position.set(cx, BANK + 0.09, p.z1 - 2.2 - courtDepth / 2);
  court.name = `court-${spec.id}`;
  group.add(court);

  // 大厅
  const hallZ = p.z1 - 3.0 - courtDepth - spec.hallDepth / 2 + 0.6;
  group.add(hallOf({
    id: `hall-${spec.id}`, x: cx, z: hallZ, rot: Math.PI,
    w: Math.min(width - 3.2, spec.bays * 3.1 + 1.4), d: spec.hallDepth, h: spec.hallH ?? 4.4,
    bays: spec.bays, openMiddle: false, plaqueText: null, rise: 1.95,
  }));

  // 后进的楼
  const rearZ = hallZ - spec.hallDepth / 2 - 2.2 - (spec.rearDepth ?? 4.2) / 2;
  if (rearZ > p.z0 + 3.4) {
    group.add(towerOf({
      id: `rear-${spec.id}`, x: cx, z: rearZ, rot: Math.PI,
      w: Math.min(width - 3.6, spec.bays * 2.9), d: spec.rearDepth ?? 4.4, plaqueText: null,
    }));
  }

  // 灯：门楼两侧一对、厅前檐下一对
  const spots = [
    [cx - gateW / 2 - 0.9, BANK + 3.0, p.z1 - 0.4, 0.24],
    [cx + gateW / 2 + 0.9, BANK + 3.0, p.z1 - 0.4, 0.24],
    [cx - 2.6, BANK + 3.5, hallZ - spec.hallDepth / 2 - 2.0, 0.26],
    [cx + 2.6, BANK + 3.5, hallZ - spec.hallDepth / 2 - 2.0, 0.26],
  ];
  const { shells, halos } = lampBatch(spots, { tint: '#ffcf98', bright: 1.15 });
  halos.name = `compound-halos-${spec.id}`;
  group.add(shells);
  group.add(halos);

  scene.add(group);
  return {
    group, name: spec.name,
    gate: { x: cx, z: p.z1 },
    hall: { x: cx, z: hallZ },
    /** 扫门楼的那盏：位置在门楼侧前方、压低角度 */
    light: { x: cx + (rand() > 0.5 ? 3.4 : -3.4), y: BANK + 1.5, z: p.z1 + 2.6, i: 240, d: 14, c: '#ffd9ac' },
    courtY: BANK + 0.1,
  };
}

export function buildCompounds(scene) {
  const specs = [
    { id: 'chongben', name: '崇本堂', plot: RESERVE[1], bays: 5, hallDepth: 8.4, hallH: 4.6, rearDepth: 5.2 },
    { id: 'jiayin', name: '嘉荫堂', plot: RESERVE[2], bays: 4, hallDepth: 7.2, hallH: 4.2, rearDepth: 4.2 },
    { id: 'gengle', name: '耕乐堂', plot: RESERVE[3], bays: 4, hallDepth: 7.6, hallH: 4.3, rearDepth: 4.6 },
    { id: 'chen', name: '百尺梧桐', plot: RESERVE[4], bays: 3, hallDepth: 6.6, hallH: 4.0, rearDepth: 4.0 },
  ];
  const built = {};
  for (const s of specs) {
    built[s.id] = compound(scene, s);
  }
  const lights = Object.values(built).map((b) => b.light);
  return { built, lights, materials: { BRICK, CARVED, PLASTER, TILE, PAVE } };
}
