/**
 * Interiors you reach through the portals: the hall of the Confucius Temple, the
 * roof-side of the riverside gallery, and a lane of exam cells at the Jiangnan
 * Examination Hall. Everything is authored against LAYOUT, so it lines up with
 * whatever architecture.js actually built.
 */
import * as THREE from 'three';
import { M, lit, glow, plaqueMesh, box, mesh, registerOccluder } from './kit.js';
import { LAYOUT } from './architecture.js';
import { RIVER } from './data.js';
import * as T from './textures.js';

const Q = RIVER.quayY;

/** dark polished 金砖 floor, ribbed timber ceiling, lacquer fittings */
const floorMat = lit('#3a3229', { map: T.stone('#4a4038'), rough: 0.42, metal: 0.08 });
const ceilingMat = lit('#8d94a6', { map: T.roofTiles('#2a1f16', '#3d2e21', '#5c4632'), rough: 0.8, side: THREE.DoubleSide });
const lacquer = lit('#8e2a22', { map: T.wood('#7d2620', '#4a1512'), rough: 0.5 });
const giltWood = lit('#c9a05a', { rough: 0.4, metal: 0.6, emissive: '#2e1f08', ei: 0.5 });
const bronze = lit('#7a5f33', { rough: 0.45, metal: 0.7 });
const candle = glow('#ffd9a0', 1.9);

function raftersTextureSpan(w, d, repeatU) {
  const m = ceilingMat.clone();
  m.map = m.map.clone();
  m.map.repeat.set(repeatU, Math.max(1, d / 2.2));
  m.map.needsUpdate = true;
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(Math.PI / 2);
  return { g, m };
}

/* ------------------------------------------------------------------ 大成殿 */
function templeHall(parent) {
  const t = LAYOUT.temple;
  const spanX = t.x1 - t.x0, midX = (t.x0 + t.x1) / 2, g = new THREE.Group();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(spanX - 0.4, t.halfZ * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, t.floorY + 0.03, 0);
  floor.receiveShadow = true;

  const ceil = raftersTextureSpan(spanX - 0.6, t.halfZ * 2 - 0.6, 26);
  ceil.g.rotateX(Math.PI / 2);
  const ceilMesh = new THREE.Mesh(ceil.g, ceil.m);
  ceilMesh.position.set(midX, t.ceilY - 0.15, 0);

  // 金柱 forming the central bay that carries the coffer
  const cols = [];
  for (const dx of [-6.2, -1.4, 3.4]) for (const dz of [-4.4, 4.4]) {
    cols.push(box(0.62, t.ceilY - t.floorY, 0.62, midX + dx, (t.floorY + t.ceilY) / 2, dz));
  }
  const colMesh = mesh(cols, lacquer);
  colMesh.castShadow = true;

  // 藻井: nested frames stepping up, with a lit mirror at the crown
  const coffer = new THREE.Group();
  const cy = t.ceilY - 0.4;
  for (let i = 0; i < 4; i++) {
    const w = 5.6 - i * 1.15, y = cy + i * 0.34;
    const frame = [box(w, 0.3, 0.22, 0, y, w / 2), box(w, 0.3, 0.22, 0, y, -w / 2),
      box(0.22, 0.3, w, w / 2, y, 0), box(0.22, 0.3, w, -w / 2, y, 0)];
    const fm = mesh(frame, i % 2 ? giltWood : lacquer);
    fm.rotation.y = i * Math.PI / 8;
    coffer.add(fm);
  }
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), glow('#ffd9a2', 1.5));
  mirror.rotation.x = Math.PI / 2;
  mirror.position.y = cy + 1.5;
  coffer.add(mirror);
  coffer.position.set(midX - 1.4, 0, 0);

  // 孔子像 on a silled dais at the east end, rite vessels in front
  const sx = t.x1 - 3.2;
  const dais = mesh([
    box(5.2, 0.55, 4.2, sx, t.floorY + 0.28, 0),
    box(4.6, 0.5, 3.6, sx, t.floorY + 0.8, 0),
    box(6.6, 0.35, 5.0, sx, t.floorY + 1.1, 0),
  ], M.stone);
  const statue = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.32, 2.5, 14), bronze);
  robe.position.y = 1.25;
  const sleeves = mesh([
    box(0.5, 0.9, 1.5, -0.62, 1.5, 0.35), box(0.5, 0.9, 1.5, 0.62, 1.5, 0.35),
    box(1.0, 0.42, 0.9, 0, 1.28, 0.72),
  ], bronze);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), bronze);
  head.position.y = 2.86;
  const crown = mesh([
    new THREE.CylinderGeometry(0.34, 0.4, 0.34, 10).translate(0, 3.2, 0),
    box(0.22, 0.5, 0.9, 0, 3.34, -0.1),
  ], giltWood);
  statue.add(robe, sleeves, head, crown);
  statue.position.set(sx, t.floorY + 1.28, 0);
  statue.rotation.y = -Math.PI / 2;
  statue.traverse((o) => { o.castShadow = true; });

  // 屏板 behind the statue, gilt-framed
  const screen = mesh([
    box(0.3, 5.4, 7.6, t.x1 - 0.6, t.floorY + 2.9, 0),
    box(0.16, 5.8, 0.28, t.x1 - 0.75, t.floorY + 2.9, 3.9),
    box(0.16, 5.8, 0.28, t.x1 - 0.75, t.floorY + 2.9, -3.9),
  ], lacquer);

  // 祭器: incense burner, candle stands, and the bell / chime racks along the walls
  const table = mesh([
    box(2.6, 0.18, 1.1, sx - 2.6, t.floorY + 1.5, 0),
    box(0.2, 1.0, 0.2, sx - 3.7, t.floorY + 0.95, 0.4), box(0.2, 1.0, 0.2, sx - 1.5, t.floorY + 0.95, -0.4),
    box(0.2, 1.0, 0.2, sx - 3.7, t.floorY + 0.95, -0.4), box(0.2, 1.0, 0.2, sx - 1.5, t.floorY + 0.95, 0.4),
  ], lacquer);
  const burner = mesh([
    new THREE.CylinderGeometry(0.52, 0.36, 0.62, 12).translate(sx - 2.6, t.floorY + 1.9, 0),
    new THREE.TorusGeometry(0.5, 0.07, 6, 14).rotateX(Math.PI / 2).translate(sx - 2.6, t.floorY + 2.2, 0),
  ], bronze);
  const racks = [];
  for (const dz of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = dz * (t.halfZ - 1.1);
      const x = t.x0 + 2.6 + i * 1.35;
      racks.push(box(0.14, 2.2, 0.14, x, t.floorY + 1.1, z));
      racks.push(box(1.3, 0.14, 0.14, x + 0.65, t.floorY + 2.1, z));
      // 编钟 / 编磬 hung from the rail
      racks.push(new THREE.CylinderGeometry(0.16, 0.2, 0.34 - i * 0.02, 8).translate(x + 0.65, t.floorY + 1.72 - i * 0.03, z));
    }
  }
  const rackMesh = mesh(racks, lacquer);
  const bells = mesh(racks.filter((_, i) => i % 3 === 2), bronze);

  // 御书匾额: the three Qing imperial boards over the central bay, plus rite lamps
  const boards = [
    ['万世师表', midX - 1.4, t.ceilY - 1.5, 0, Math.PI / 2],
    ['与天地参', sx - 0.4, t.ceilY - 1.9, 0, Math.PI / 2],
    ['斯文在兹', midX + 2.6, t.ceilY - 1.5, 0, Math.PI / 2],
  ];
  for (const [text, x, y, z, ry] of boards) {
    const b = plaqueMesh(text, 2.9, 1.0, { dir: 'h', bg: '#123057', fg: '#f6e3b6' });
    b.position.set(x, y, z);
    b.rotation.y = ry;
    g.add(b);
  }
  const lamps = [];
  for (let i = 0; i < 6; i++) {
    const x = t.x0 + 2.2 + i * ((spanX - 4.4) / 5);
    lamps.push(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), glow('#ffca86', 1.5)).translateY(0));
    lamps[lamps.length - 1].position.set(x, t.floorY + 4.3, 0);
  }

  const key = new THREE.PointLight(0xffb867, 150, 34, 2);
  key.position.set(sx - 3.2, t.floorY + 4.6, 0);
  const fill = new THREE.PointLight(0xffd39a, 90, 40, 2);
  fill.position.set(t.doorX + 3.5, t.floorY + 4.4, 0);

  g.add(floor, ceilMesh, colMesh, coffer, dais, statue, screen, table, burner, rackMesh, bells, key, fill, ...lamps);
  parent.add(g);
  LAYOUT.templeInterior = { x0: t.x0, x1: t.x1, floorY: t.floorY, doorX: t.doorX, halfZ: t.halfZ, midX, statueX: sx };
  return g;
}

/* ------------------------------------------------------------------ 画廊廊内 */
function galleryInterior(parent) {
  const gl = LAYOUT.gallery;
  const g = new THREE.Group();
  const width = Math.abs(gl.x1 - gl.x0) + 1.6;
  const midX = (gl.x0 + gl.x1) / 2;
  const len = gl.zB - gl.zA + 2;

  // 天花 with rafters just under the lower eave, so the corridor reads from inside
  const ceil = raftersTextureSpan(width, len, 30);
  const cm = new THREE.Mesh(ceil.g, ceil.m);
  cm.position.set(midX, gl.eaveY - 0.12, 0);
  cm.receiveShadow = true;

  // 挂落 fringe band along both colonnades
  const bands = [];
  for (const x of [gl.x0 + 0.75, gl.x1 - 0.75]) {
    bands.push(box(0.16, 0.42, len - 1, x, gl.eaveY - 0.5, 0));
    for (let z = gl.zA; z <= gl.zB; z += 0.9) bands.push(box(0.1, 0.5, 0.1, x, gl.eaveY - 0.95, z));
  }
  const bandMesh = mesh(bands, lacquer);

  // 方砖 paving over the stone deck
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.6, len), floorMat);
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(midX, gl.deckY + 0.06, 0);
  pave.receiveShadow = true;

  const warm = new THREE.PointLight(0xffa95f, 110, 46, 2);
  warm.position.set(midX, gl.eaveY - 1.2, -14);
  const warm2 = new THREE.PointLight(0xffa95f, 110, 46, 2);
  warm2.position.set(midX, gl.eaveY - 1.2, 30);

  g.add(ceilMeshOnly(cm), bandMesh, pave, warm, warm2);
  parent.add(g);
  return g;
}
const ceilMeshOnly = (m) => m;

/* ------------------------------------------------------------------ 号舍巷道 */
function cellsAlley(parent) {
  const gy = LAYOUT.gongyuan;
  const x = gy.cellsX0 - 6;            // clear of the existing cell block
  const z0 = 60, z1 = 84, laneHalf = 1.35, cellD = 1.6, cellW = 1.95;
  const g = new THREE.Group();
  const walls = [], boards = [], props = [];

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(laneHalf * 2 + 2 * cellD + 1, z1 - z0 + 3), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, Q + 0.05, (z0 + z1) / 2);
  floor.receiveShadow = true;

  for (const side of [-1, 1]) {
    const front = x + side * laneHalf;                 // opening line facing the lane
    const back = front + side * cellD;
    for (let i = 0; i < 12; i++) {
      const zc = z0 + (i + 0.5) * ((z1 - z0) / 12);
      const zw = (z1 - z0) / 12;
      // party wall between cells
      walls.push(box(Math.abs(back - front) + 0.3, 2.5, 0.22, (front + back) / 2, Q + 1.25, zc - zw / 2));
      // back wall
      walls.push(box(0.24, 2.5, zw, back, Q + 1.25, zc));
      // 号板: upper and lower boards, the candidate's desk and bed
      boards.push(box(cellD - 0.15, 0.12, zw - 0.35, (front + back) / 2, Q + 0.62, zc));
      boards.push(box(cellD - 0.15, 0.12, zw - 0.35, (front + back) / 2, Q + 1.62, zc));
      // 砚台、烛台、考篮
      props.push(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.22), M.stoneDark).translateX(0));
      props[props.length - 1].position.set((front + back) / 2, Q + 0.72, zc - 0.25);
      props.push(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.26, 6), bronze));
      props[props.length - 1].position.set((front + back) / 2 + 0.3, Q + 0.81, zc + 0.2);
      props.push(new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), candle));
      props[props.length - 1].position.set((front + back) / 2 + 0.3, Q + 1.0, zc + 0.2);
      // one lamp per cell mouth
      props.push(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), glow('#ffcb85', 1.35)));
      props[props.length - 1].position.set(front - side * 0.18, Q + 2.05, zc);
    }
    // lane-side lintel
    walls.push(box(Math.abs(back - front), 0.3, z1 - z0, (front + back) / 2, Q + 2.55, (z0 + z1) / 2));
  }
  // end walls and the gable roof over the lane
  walls.push(box(2 * laneHalf + 2 * cellD + 0.6, 2.6, 0.3, x, Q + 1.3, z0 - 0.15));
  walls.push(box(2 * laneHalf + 2 * cellD + 0.6, 2.6, 0.3, x, Q + 1.3, z1 + 0.15));

  const roofGeo = T.roofTiles('#2a3145', '#414b63', '#66748f');
  const roofMat = lit('#c3cad8', { map: roofGeo, rough: 0.8, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(cellD * 2 + laneHalf * 2 + 1.4, z1 - z0 + 1.6), roofMat);
    slope.rotation.x = -Math.PI / 2;
    slope.rotation.z = side * 0.42;
    slope.position.set(x, Q + 3.5, (z0 + z1) / 2);
    g.add(slope);
  }
  const ridge = mesh(box(0.4, 0.35, z1 - z0 + 1.6, x, Q + 3.85, (z0 + z1) / 2), M.ridge);
  g.add(ridge);

  const wallMesh = mesh(walls, M.stoneDark);
  wallMesh.castShadow = true;
  const boardMesh = mesh(boards, lacquer);
  g.add(floor, wallMesh, boardMesh, ...props);
  const lamp = new THREE.PointLight(0xffbb77, 70, 26, 2);
  lamp.position.set(x, Q + 2.3, z0 + 6);
  const lamp2 = new THREE.PointLight(0xffbb77, 70, 26, 2);
  lamp2.position.set(x, Q + 2.3, z1 - 6);
  g.add(lamp, lamp2);

  // 榜文 notice board at the lane mouth
  const notice = plaqueMesh('奉天考官 严禁挟带', 3.4, 1.1, { dir: 'h', bg: '#2a2118', fg: '#e8d5a8' });
  notice.position.set(x, Q + 2.1, z0 - 0.45);
  g.add(notice);

  parent.add(g);
  LAYOUT.alley = { x, z0, z1, floorY: Q, laneHalf };
  return g;
}

/* ------------------------------------------------------------------ assembly */
export function buildInteriors(scene) {
  const group = new THREE.Group();
  group.name = 'interiors';
  templeHall(group);
  galleryInterior(group);
  cellsAlley(group);
  scene.add(group);
  return { group };
}
