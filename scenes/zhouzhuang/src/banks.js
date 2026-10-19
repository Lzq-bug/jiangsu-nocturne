import * as THREE from 'three';
import { RIVERS, TOWN, waterRects } from './data.js';
import { box, mesh, rectUniforms, maskGlsl, M } from './kit.js';
import * as T from './textures.js';

/**
 * 井字河道的岸：花岗石驳岸 + 压顶石 + 沿河街面 + 埠头 + 穿竹石栏。
 *
 * 街面是一整片被水面矩形"挖掉"的铺地，驳岸则是压在矩形边线上的石墙 ——
 * 矩形相交处（丁字、十字）自动断开，所以汇口不需要手工补洞。
 */

const WALL_T = 1.3;          // 驳岸厚（一半在水里，一半在岸上）
const WALL_BOT = -4.2;

/** the four sides of one rect, as segments that survive the junction cuts */
function rectSides(r) {
  const x0 = r.axis === 'x' ? r.x0 : r.at - r.half;
  const x1 = r.axis === 'x' ? r.x1 : r.at + r.half;
  const z0 = r.axis === 'x' ? r.at - r.half : r.z0;
  const z1 = r.axis === 'x' ? r.at + r.half : r.z1;
  return { x0, z0, x1, z1 };
}

/** intervals along a side that another rect opens up (a junction) */
function gaps(sides, others, side) {
  const out = [];
  const { x0, z0, x1, z1 } = sides;
  const horizontal = side === 'n' || side === 's';
  const line = side === 'n' ? z0 : side === 's' ? z1 : side === 'w' ? x0 : x1;
  const inward = (side === 'n' || side === 'w') ? -1 : 1;
  for (const o of others) {
    const os = rectSides(o);
    if (horizontal) {
      // a vertical rect crossing this horizontal edge opens it
      if (os.z0 < line - 1.5 && os.z1 > line + 1.5) {
        const a = Math.max(x0, os.x0), b = Math.min(x1, os.x1);
        if (b - a > 1) out.push([a, b]);
      }
      // a horizontal rect butted against this edge (丁字口) opens it too
      if (Math.abs((side === 'n' ? os.z1 : os.z0) - line) < 1.5 &&
          Math.abs(os.z1 - os.z0 - 2 * o.half) < 0.01 &&
          Math.abs(o.half - 0) < 1e9) {
        const p0 = o.axis === 'x' ? [o.x0, o.x1] : [o.at - o.half, o.at + o.half];
        const a = Math.max(x0, p0[0]), b = Math.min(x1, p0[1]);
        if (b - a > 1 && Math.abs((side === 'n' ? -1 : 1) * (o.at - line) * inward) < 40) out.push([a, b]);
      }
    } else {
      if (os.x0 < line - 1.5 && os.x1 > line + 1.5) {
        const a = Math.max(z0, os.z0), b = Math.min(z1, os.z1);
        if (b - a > 1) out.push([a, b]);
      }
    }
  }
  return out;
}

function subtractSpan(a, b, gaps) {
  const segs = [[a, b]];
  for (const [g0, g1] of gaps) {
    for (let i = segs.length - 1; i >= 0; i--) {
      const [s, e] = segs[i];
      if (g1 <= s || g0 >= e) continue;
      segs.splice(i, 1);
      if (g0 - s > 0.8) segs.push([s, g0]);
      if (e - g1 > 0.8) segs.push([g1, e]);
    }
  }
  return segs;
}

/** 埠头 — a flight of stone steps down to the water, with cheek walls */
function steps(axis, along, at, yTop, yBottom, count, width = 3.2) {
  const parts = [];
  const rise = (yTop - yBottom) / count;
  const tread = 0.9;
  for (let i = 0; i < count; i++) {
    const y = yTop - i * rise;
    const off = at + i * tread;
    if (axis === 'x') parts.push(box(tread, rise, width, off - tread / 2, y - rise, along));
    else parts.push(box(width, rise, tread, along, y - rise, off - tread / 2));
  }
  for (const s of [-1, 1]) {
    if (axis === 'x') parts.push(box(count * tread + 0.6, yTop - yBottom + 0.4, 0.5, at + (count * tread) / 2 - 0.3, yBottom - 0.4, along + s * (width / 2 + 0.25)));
    else parts.push(box(0.5, yTop - yBottom + 0.4, count * tread + 0.6, along + s * (width / 2 + 0.25), yBottom - 0.4, at + (count * tread) / 2 - 0.3));
  }
  return parts;
}

/* ------------------------------------------------------------------ ground */

function pavedGround(scene) {
  const uni = rectUniforms(waterRects());
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4b5058, map: T.paving('#3b4048', 3.2), roughness: 0.86, metalness: 0.04,
  });
  mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
  const geo = new THREE.PlaneGeometry(1500, 1180, 60, 48);
  geo.rotateX(-Math.PI / 2);
  // metre-scaled UVs so a 6 m lane and a 400 m embankment share one slab size
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + 60) / 3.2, (pos.getZ(i) + 120) / 3.2);
  }
  uv.needsUpdate = true;
  const ref = { ...uni };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ref);
    sh.fragmentShader = maskGlsl + sh.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      float sd = waterSd(vWorldPos.xz);
      if (sd > -0.62) discard;
    `);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `
      varying vec3 vWorldPos;
      #include <common>`);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `
      varying vec3 vWorldPos;
      uniform vec4 uRects[${16}];
      uniform int uNum;
      #include <common>`);
    // the mask helper needs world position in the vertex stage too (it is cheap)
    sh.vertexShader = sh.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vWorldPos = (modelMatrix * vec4(transformed,1.0)).xyz;`);
    sh.vertexShader = `float waterSd(vec2 p){
      float best = 1.0e6;
      for (int i = 0; i < 16; i++) {
        if (i >= uNum) break;
        vec4 r = uRects[i];
        if (r.z < 0.0) continue;
        vec2 q = abs(p - r.xy) - r.zw;
        best = min(best, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
      }
      return best;
    }\n` + sh.vertexShader;
  };
  mat.customProgramCacheKey = () => 'zz-ground-mask';
  const ground = new THREE.Mesh(geo, mat);
  ground.position.set(60, TOWN.quayTopY, 120);
  ground.receiveShadow = true;
  ground.name = 'zz-ground';
  scene.add(ground);
  return { ground, mat };
}

/* ------------------------------------------------------------------ banks */

export function buildBanks(scene) {
  const g = new THREE.Group();
  g.name = 'banks';
  const stone = [], wet = [], coping = [], rail = [], wood = [], lantern = [], lampPos = [];

  const list = Object.entries(RIVERS).filter(([, r]) => !r.noWall && r.name !== '南湖' && r.name !== '白蚬江');
  const all = list.map(([, r]) => r);
  for (const [key, r] of list) {
    const sides = rectSides(r);
    const others = all.filter((o) => o !== r);
    const top = TOWN.wallTop;
    const h = top - WALL_BOT;
    for (const side of ['n', 's', 'w', 'e']) {
      const gp = gaps(sides, others, side);
      if (side === 'n' || side === 's') {
        const z = side === 'n' ? sides.z0 : sides.z1;
        for (const [a, b] of subtractSpan(sides.x0, sides.x1, gp)) {
          stone.push(box(b - a, h, WALL_T, (a + b) / 2, WALL_BOT, z));
          coping.push(box(b - a, 0.24, 0.78, (a + b) / 2, top, z - (side === 'n' ? -0.5 : 0.5)));
          wet.push(box(b - a, 1.4, 0.5, (a + b) / 2, -1.1, z + (side === 'n' ? 0.9 : -0.9)));
        }
      } else {
        const x = side === 'w' ? sides.x0 : sides.x1;
        for (const [a, b] of subtractSpan(sides.z0, sides.z1, gp)) {
          stone.push(box(WALL_T, h, b - a, x, WALL_BOT, (a + b) / 2));
          coping.push(box(0.78, 0.24, b - a, x - (side === 'w' ? -0.5 : 0.5), top, (a + b) / 2));
          wet.push(box(0.5, 1.4, b - a, x + (side === 'w' ? 0.9 : -0.9), -1.1, (a + b) / 2));
        }
      }
    }
    void key;
  }

  /* ---------------- 埠头：下船的石级 */
  const yTop = TOWN.wallTop - 0.2, yBot = -0.5;
  // 市河两岸
  for (const x of [-150, -108, -64, -20, 24, 66, 100]) {
    stone.push(...steps('x', -11.6, x, yTop, yBot, 5, 3.0));      // 北岸下市河
    stone.push(...steps('x', 11.6, x, yTop, yBot, 5, 3.0));       // 南岸
  }
  // 市河南段（沈厅河埠在这里，宽一级）
  stone.push(...steps('z', 48.4, 42, yTop, yBot, 6, 5.4));
  for (const z of [64, 96, 128]) stone.push(...steps('z', 48.4, z, yTop, yBot, 5, 2.8));
  for (const z of [60, 92, 124]) stone.push(...steps('z', 25.6, z, yTop, yBot, 5, 2.8));
  // 后港、银子浜、西湾、箸泾
  for (const x of [-166, -140, -80, -40, 10, 56]) stone.push(...steps('x', -45.6, x, yTop, yBot, 4, 2.6));
  for (const z of [-120, -80, -46]) stone.push(...steps('z', 85.6, z, yTop, yBot, 4, 2.6));
  for (const z of [-116, -74, -40]) stone.push(...steps('z', 98.4, z, yTop, yBot, 4, 2.6));
  for (const z of [-36, -12]) stone.push(...steps('z', -122.6, z, yTop, yBot, 4, 2.8));
  for (const z of [30, 58, 96, 126]) stone.push(...steps('z', -37.6, z, yTop, yBot, 4, 2.4));

  /* ---------------- 系缆桩 与 如意形缆船石 */
  for (const x of [-158, -136, -96, -52, -8, 30, 74, 106]) stone.push(box(0.34, 0.86, 0.34, x, TOWN.quayTopY - 0.4, -12.4));
  for (const x of [-150, -120, -70, -30, 14, 60, 96]) stone.push(box(0.34, 0.86, 0.34, x, TOWN.quayTopY - 0.4, 12.4));
  for (const z of [-100, -60, -30]) stone.push(box(0.34, 0.86, 0.34, 84.6, TOWN.quayTopY - 0.4, z));
  for (const z of [-110, -70, -34]) stone.push(box(0.34, 0.86, 0.34, 99.4, TOWN.quayTopY - 0.4, z));
  // 箸泾岸上的如意缆船石：一块扁石，中间凿出系船的凹口
  for (const z of [30, 44, 74, 104]) {
    stone.push(box(0.9, 0.3, 0.7, -36.6, TOWN.wallTop - 0.15, z));
    stone.push(box(0.3, 0.34, 0.3, -36.6, TOWN.wallTop + 0.05, z));
  }

  /* ---------------- 穿竹石栏：石望柱间穿竹竿 */
  const railSpots = [
    ['x', -14, -170, 8], ['x', 14, -170, 108], ['z', 51, 30, 146], ['z', 23, 30, 146],
    ['z', 83, -140, -22], ['z', 101, -140, -22], ['z', -123, -40, 8],
  ];
  for (const [axis, line, a, b] of railSpots) {
    const span = Math.abs(b - a);
    const n = Math.max(2, Math.round(span / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = a + (b - a) * (i / n);
      if (axis === 'x') rail.push(box(0.24, 1.02, 0.24, t, TOWN.wallTop - 0.1, line));
      else rail.push(box(0.24, 1.02, 0.24, line, TOWN.wallTop - 0.1, t));
    }
    // 两道穿竹（竹竿比石柱低，读出来是一条深色细线）
    for (const k of [0.52, 0.86]) {
      if (axis === 'x') wood.push(box(span, 0.12, 0.12, (a + b) / 2, TOWN.wallTop - 0.1 + k, line));
      else wood.push(box(0.12, 0.12, span, line, TOWN.wallTop - 0.1 + k, (a + b) / 2));
    }
  }

  /* ---------------- 沿河石灯柱：夜里就是这一串照街 */
  const lampAt = [
    ['x', -13.2, -168, 96, 15], ['x', 13.2, -168, 108, 15],
    ['z', 49.8, 34, 144, 14], ['z', 24.2, 34, 144, 14],
    ['z', 84.2, -138, -26, 13], ['z', 100.2, -138, -26, 13],
    ['z', -123.4, -38, 6, 11], ['x', -46.4, -34, 126, 15],
  ];
  for (const [axis, line, a, b, step] of lampAt) {
    for (let t = a; t <= b; t += step) {
      const x = axis === 'x' ? t : line;
      const z = axis === 'x' ? line : t;
      stone.push(box(0.36, 2.5, 0.36, x, TOWN.wallTop - 0.2, z));
      stone.push(box(0.86, 0.2, 0.86, x, TOWN.wallTop + 2.3, z));
      coping.push(box(1.06, 0.2, 1.06, x, TOWN.wallTop + 2.5, z));
      const core = box(0.42, 0.46, 0.42, x, TOWN.wallTop + 1.62, z, 0);
      lantern.push(core);
      lampPos.push([x, TOWN.wallTop + 1.85, z]);
    }
  }

  g.add(mesh(stone, M.stone));
  g.add(mesh(wet, wetStoneMat()));
  g.add(mesh(coping, M.stoneWarm));
  g.add(mesh(rail, M.stoneWarm));
  g.add(mesh(wood, M.plank));
  g.add(mesh(lantern, M.archLamp));
  scene.add(g);

  pavedGround(scene);

  return { group: g, lamps: lampPos, lights: realLights(scene, lampPos) };
}

/**
 * Real lights only where a station actually stands — r160 puts every light in
 * every shader, and a lamp per 石灯柱 would be two hundred of them.
 */
function realLights(scene, lampPos) {
  const pickList = [
    [-128, 2, 'xiwan'], [-40, -13, 'lane-west'], [10, -13, 'lane-mid'], [60, -13, 'lane-east'],
    [37, 20, 'fuan'], [37, 60, 'shen-quay'], [92, -30, 'shuang'], [92, -70, 'shuang-n'],
    [-42, 34, 'zhang'], [-42, 76, 'zhujing'], [-96, -30, 'daoist'], [-20, 160, 'nanhu-n'],
    [-150, 110, 'nanduan-s'], [30, 120, 'nanduan-e'],
  ];
  const lights = [];
  for (let i = 0; i < pickList.length; i++) {
    const [x, z] = pickList[i];
    let y = TOWN.wallTop + 2.4;
    // snap to the nearest 石灯柱 so the pool of light sits under a lamp
    let best = 1e9;
    for (const [lx, ly, lz] of lampPos) {
      const d = (lx - x) ** 2 + (lz - z) ** 2;
      if (d < best) { best = d; y = ly + 0.3; }
    }
    const far = i < 6;
    const l = new THREE.PointLight(0xffb978, far ? 240 : 210, far ? 26 : 22, 2);
    l.position.set(x, y, z);
    lights.push(l);
    scene.add(l);
  }
  return lights;
}

const mem = new Map();
function cached(key, make) { return mem.has(key) ? mem.get(key) : (mem.set(key, make()), mem.get(key)); }
function wetStoneMat() {
  return cached('wet', () => new THREE.MeshStandardMaterial({ color: 0x2c3a34, roughness: 0.28, metalness: 0.3 }));
}
