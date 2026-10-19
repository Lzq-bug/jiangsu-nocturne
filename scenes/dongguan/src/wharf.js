import * as THREE from 'three';
import { STREET, PLAZA, CANAL, WHARF_PAIFANG } from './data.js';
import { M, PAL, box, mesh, floorQuad, rand, rr, pick, glow } from './kit.js';

const DECK = STREET.deck;
const BANK_X = CANAL.x0;          // 西岸驳岸的 x
const SPAN = 150;                 // 岸线在画面里南北各延这么多，其余交给雾

/* ------------------------------------------------------------------ 渡口广场 */

function buildPlaza(parts) {
  const zHalf = STREET.half + 4.2;
  parts.pave.push(floorQuad({ x0: PLAZA.x0, x1: BANK_X, z0: -zHalf, z1: zHalf, y: DECK, tile: [8, 8], origin: [PLAZA.x0, -zHalf] }));
  // 向河收分的石阶与堤面
  parts.curb.push(box(BANK_X - PLAZA.x0, 0.3, zHalf * 2 + 1.2, (PLAZA.x0 + BANK_X) / 2, DECK - 0.28, 0));
  // 西岸整排驳岸：水下只留 0.35 米裙墙，不然堤后整片水面与灯柱都被墙挡住
  parts.stone.push(box(1.3, DECK + 0.35, SPAN * 2, BANK_X + 0.35, -0.35, 0));
  for (const side of [-1, 1]) {
    parts.stone.push(box(0.42, 0.42, SPAN * 2, BANK_X + 0.1, DECK + 0.14, side * (zHalf - 0.5)));
    for (let z = -SPAN + 6; z < SPAN; z += 7) {
      parts.stone.push(box(0.3, 0.9, 0.3, BANK_X + 0.1, DECK, z + (side > 0 ? 0.6 : -0.6)));
    }
  }
  // 亲水台阶：五级下到水面，只在渡口这一段
  for (let i = 0; i < 5; i++) {
    parts.stone.push(box(2.6 + i * 0.2, 0.34, 1.1, BANK_X + 0.5 + i * 1.05, DECK - 0.34 - i * 0.34, 2.4));
    parts.stone.push(box(2.6 + i * 0.2, 0.34, 1.1, BANK_X + 0.5 + i * 1.05, DECK - 0.34 - i * 0.34, -3.6));
  }
  // 系船石
  for (const z of [-8, -2.5, 7.5, 13.5, 21]) {
    parts.stone.push(new THREE.CylinderGeometry(0.19, 0.24, 0.8, 8, 1).translate(BANK_X + 1.1, DECK - 0.35, z));
  }
}

/* -------------------------------------------------------------------- 石灯 */

function quayLamps(halo, columns, poolsWater, scene) {
  const lamps = [];
  for (const z of [-42, -18, 6, 26, 52, 78, -74]) {
    const x = BANK_X - 0.9;
    const y = DECK + 2.7;
    lamps.push({ x, y, z });
    halo.add(x, y, z, '#ffcf96', 2.8);
    columns.add(new THREE.Vector3(x + 1.6, 0, z), '#ffb46a', 2.0, 12, 0.8);
    poolsWater.add(x + 4.5, z, '#ff9a4a', 1.0, 4.5);
  }
  // 堤上只放三盏真光，其余靠灯柱与光晕撑
  for (const [z, k] of [[-30, 1], [10, 1.2], [56, 0.8]]) {
    const L = new THREE.PointLight(new THREE.Color('#ffb469'), 30 * k, 42, 2);
    L.position.set(BANK_X - 1.2, DECK + 2.8, z);
    scene.add(L);
  }
  return lamps;
}

function buildLampPosts(parts) {
  for (const z of [-42, -18, 6, 26, 52, 78, -74]) {
    const x = BANK_X - 0.9;
    parts.stone.push(box(0.3, 2.6, 0.3, x, DECK, z));
    parts.stone.push(box(0.62, 0.24, 0.62, x, DECK + 2.6, z));
    parts.stone.push(box(0.5, 0.5, 0.5, x, DECK + 2.84, z));
    parts.dark.push(box(0.72, 0.16, 0.72, x, DECK + 3.34, z));
  }
}

/* -------------------------------------------------------------------- 灯船 */

function makeBoat({ len = 11, beam = 2.6, x, z, phase }) {
  const g = new THREE.Group();
  g.name = 'boat';
  const hull = [
    box(len, 0.72, beam, 0, -0.16, 0),
    box(len * 0.55, 0.2, beam * 0.92, -len * 0.16, 0.56, 0),
    box(1.7, 0.5, 1.5, len * 0.36, 0.34, 0),
  ];
  const cabin = [
    box(len * 0.44, 1.7, beam * 0.72, -len * 0.06, 0.66, 0),
    box(len * 0.52, 0.16, beam * 0.9, -len * 0.06, 2.36, 0),
    box(0.16, 2.6, 0.16, len * 0.3, 0.6, 0),
  ];
  const m1 = mesh(hull, M.woodDark); m1.name = 'boat-hull';
  const m2 = mesh(cabin, M.wood); m2.name = 'boat-cabin';
  g.add(m1, m2);

  // 船窗与船舷的一串灯：夜里船就是一串 moving 的暖点
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), glow(PAL.paper, 1.5));
  for (const dx of [-1.4, 0, 1.4]) {
    for (const side of [-1, 1]) {
      const w = win.clone();
      w.position.set(-len * 0.06 + dx, 1.5, side * beam * 0.36);
      w.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(w);
    }
  }
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(PAL.lantern, 2.5));
  lantern.scale.set(1, 0.82, 1);
  lantern.position.set(len * 0.3, 3.0, 0);
  g.add(lantern);
  for (const dx of [-len * 0.32, -len * 0.1, len * 0.12]) {
    const l = lantern.clone();
    l.position.set(dx, 2.5, 0);
    l.scale.set(0.7, 0.6, 0.7);
    g.add(l);
  }
  g.position.set(x, 0, z);
  return { group: g, baseY: 0, phase, drift: rr(0.6, 1.4) * (pick([-1, 1]) * 0.35) };
}

/* ------------------------------------------------------------------ 对岸与桥 */

function buildFarBank(parts, halo) {
  const x = CANAL.x1;
  parts.stone.push(box(1.4, 1.8, SPAN * 2, x + 0.4, -0.9, 0));
  parts.pave.push(floorQuad({ x0: x + 1.1, x1: x + 12, z0: -SPAN, z1: SPAN, y: 0.42, tile: [8, 8], origin: [x, 0] }));
  // 对岸屋脊：几段暗体积，窗里漏几点灯
  let z = -118;
  while (z < 120) {
    const w = rr(7, 16), d = rr(5, 9), h = rr(3.2, 6.4);
    const cx = x + 7 + d / 2;
    parts.far.push(box(w, h, d, cx, 0.42, z + w / 2));
    parts.far.push(box(w + 0.7, 0.3, d + 0.7, cx, 0.42 + h, z + w / 2));
    if (rand() < 0.62) halo.add(cx - d / 2, 0.42 + rr(1.2, h - 0.6), z + w * rr(0.2, 0.8), '#ffbc76', rr(0.7, 1.5));
    z += w + rr(1.2, 6);
  }
  // 岸树剪影
  for (let k = 0; k < 26; k++) {
    const tz = rr(-SPAN, SPAN);
    const tx = x + rr(1.6, 4.2);
    const th = rr(3.4, 6.2);
    parts.dark.push(new THREE.CylinderGeometry(0.14, 0.2, th * 0.6, 5, 1).translate(tx, 0.42 + th * 0.3, tz));
    parts.dark.push(new THREE.SphereGeometry(th * 0.34, 7, 6).translate(tx + rr(-0.4, 0.4), 0.42 + th * 0.72, tz));
  }
}

/** 远处那座跨河拱桥：画面添加，只用一道拱券和三点灯把河的纵深闭上 */
function buildBridge(parts, halo, columns) {
  const z = -118;
  const x0 = BANK_X - 4, x1 = CANAL.x1 + 6;
  const span = x1 - x0, rise = 5.2;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = x0 + t * span;
    const y = -1.0 + rise * Math.sin(Math.PI * t);
    parts.stone.push(box(span / 19 + 0.14, 0.42, 6.2, x, y, z));
    if (i % 4 === 0) parts.stone.push(box(0.34, 0.9, 0.34, x, y + 0.4, z - 2.9));
  }
  // 拱券下的暗影与桥灯
  parts.dark.push(box(span * 0.42, 0.5, 6.4, (x0 + x1) / 2, rise - 1.2, z));
  for (const dz of [-2.9, 2.9]) {
    for (const t of [0.22, 0.5, 0.78]) {
      const x = x0 + t * span;
      const y = -1.0 + rise * Math.sin(Math.PI * t) + 1.6;
      halo.add(x, y, z + dz, '#ffc27e', 1.5);
    }
  }
  columns.add(new THREE.Vector3((x0 + x1) / 2, 0, z), '#ffb46a', 3.2, 14, 0.4);
}

/* -------------------------------------------------------------------- 组装 */

export function buildWharf(scene, { halo, poolsWater, columns }) {
  const parts = { pave: [], curb: [], stone: [], dark: [], far: [] };
  buildPlaza(parts);
  buildLampPosts(parts);
  quayLamps(halo, columns, poolsWater, scene);

  // 灯河收口处在水面上落一条长暖光，让"街"和"河"接得上
  columns.add(new THREE.Vector3(BANK_X + 6, 0, 0), '#ff9f55', 9, 30, 0.55);
  for (const side of [-1, 1]) {
    columns.add(new THREE.Vector3(WHARF_PAIFANG, 0, side * 3.4), '#ffbb72', 2.2, 12, 0.4);
  }
  // 河面漂灯
  for (let k = 0; k < 16; k++) {
    const x = rr(BANK_X + 3, CANAL.x1 - 4), z = rr(-70, 80);
    halo.add(x, 0.16, z, '#ffb069', rr(0.5, 1.0));
    if (k % 3 === 0) {
      columns.add(new THREE.Vector3(x, 0, z), '#ff9d52', 0.9, 8, 0.5);
      poolsWater.add(x, z - 3, '#ff9d52', 0.55, 3);
    }
  }

  const boats = [
    makeBoat({ len: 12, beam: 2.8, x: BANK_X + 9, z: 20, phase: 0.4 }),
    makeBoat({ len: 9, beam: 2.2, x: BANK_X + 26, z: -34, phase: 2.1 }),
    makeBoat({ len: 13.5, beam: 3.0, x: CANAL.x1 - 12, z: 74, phase: 4.3 }),
  ];
  const grp = new THREE.Group();
  grp.name = 'wharf';
  for (const b of boats) grp.add(b.group);
  scene.add(grp);

  buildFarBank(parts, halo);
  buildBridge(parts, halo, columns);

  const add = (list, mat, name) => {
    if (!list.length) return;
    const m = mesh(list, mat);
    m.name = name;
    grp.add(m);
  };
  add(parts.pave, M.paving, 'wharf-paving');
  add(parts.curb, M.curb, 'wharf-curb');
  add(parts.stone, M.stoneP, 'wharf-stone');
  add(parts.dark, M.woodDark, 'wharf-dark');
  add(parts.far, M.farHouse, 'wharf-farbank');

  // 每船两根灯柱跟着船走，水面再拖一条长灯影
  const cols = boats.map((b, i) => {
    const a = columns.add(new THREE.Vector3(b.group.position.x, 0, b.group.position.z), '#ffb26a', 2.6, 12, 0.7);
    const c = columns.add(new THREE.Vector3(b.group.position.x, 0, b.group.position.z + 1.2), '#ff9440', 1.3, 7, 0.5);
    poolsWater.add(b.group.position.x + 1.5, b.group.position.z - 4, '#ffab5e', 1.5, 6);
    return { a, c, i };
  });
  poolsWater.add(BANK_X + 9, 0, '#ff9f55', 3.0, 14);

  return {
    group: grp,
    update(t) {
      boats.forEach((b, i) => {
        const g = b.group;
        g.position.z += Math.sin(t * 0.06 + b.phase) * 0.004 + b.drift * 0.004;
        g.position.y = Math.sin(t * 0.9 + b.phase) * 0.05;
        g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.012;
        g.rotation.y = Math.sin(t * 0.35 + b.phase) * 0.03;
        const v = new THREE.Vector3(g.position.x, 0, g.position.z);
        columns.setPos(cols[i].a, v);
        columns.setPos(cols[i].c, v);
      });
    },
  };
}
