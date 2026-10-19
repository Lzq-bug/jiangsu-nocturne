import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARDEN, GROUND } from './data.js';
import { box, lit, glow, mesh, pathFrames, rand, rr, quadGrid } from './kit.js';
import * as T from './textures.js';

/**
 * The ground: garden floor packed around the pool, the quays between wall and
 * water, the paved walks, and the anonymous city that presses on all four sides.
 * Nothing here is mirrored into the water, which is why it can be one big slab.
 */

const EARTH = lit('#4a5049', { map: T.paving({ meters: 2.2, base: '#414842' }), rough: 0.97 });
const QUAY = lit('#5e6467', { map: T.paving({ meters: 1.6, base: '#5a6064' }), rough: 0.9 });
const WALK = lit('#6b7176', { map: T.paving({ meters: 1.9, base: '#666e72' }), rough: 0.88 });
const CITY = lit('#141a20', { rough: 0.92 });
const FACADE = T.cityFacade();
const CITY_LIT = lit('#1c232c', { map: FACADE, emissiveMap: FACADE, emissive: '#ffffff', ei: 0.8, rough: 0.85 });

export function buildTerrain(scene) {
  const g = new THREE.Group();
  g.name = 'terrain';
  const R = GARDEN.river, E = GARDEN.eastArm, P = GARDEN.pool, W = GARDEN.wall;

  /* ---------------------------------------------------------- garden floor */
  // four rectangles packing around the inner pool, all topped at GROUND
  const fill = [];
  const ground = (x0, x1, z0, z1) => fill.push(box(x1 - x0, GROUND + 5, z1 - z0, (x0 + x1) / 2, -5, (z0 + z1) / 2));
  const poolX0 = P.xC - P.hx, poolX1 = P.xC + P.hx;
  const poolZ0 = P.zC - P.hz, poolZ1 = P.zC + P.hz;
  ground(-54, W.xE + 1, W.zN - 1, poolZ0);                     // north of the pool
  ground(-54, poolX0, poolZ0, poolZ1);                          // west of the pool
  ground(poolX1, W.xE + 1, poolZ0, poolZ1);                     // east of the pool
  ground(-54, W.xE + 1, poolZ1, 44);                            // south of the pool
  // a few metres below the surface, the pool banks need a lip they can show
  const fm = mesh(fill, EARTH);
  fm.receiveShadow = true;
  fm.name = 'garden-earth';
  g.add(fm);

  /* ------------------------------------------------------------- quays */
  // the strip between the river and the north wall, and along the east arm
  const riverEdge = R.zC + R.halfW;                     // 临河一侧的岸顶线
  const armWest = E.xC - E.halfW;
  const q = [];
  q.push(box(68 - (-200), 0.34, W.zN - riverEdge, (-200 + 68) / 2, GROUND - 0.17, (riverEdge + W.zN) / 2));
  q.push(box(armWest - W.xE, 0.34, E.zTo - E.zFrom, (W.xE + armWest) / 2, GROUND - 0.17, (E.zFrom + E.zTo) / 2));
  const qm = mesh(q, QUAY);
  qm.receiveShadow = true;
  g.add(qm);

  /* --------------------------------------------------- outer city ground */
  // four blocks; none of them may cover the two water bands
  const outer = [];
  outer.push(box(460, GROUND + 5, 200, 0, -5, -140));                       // 河之北
  outer.push(box(172, GROUND + 5, 88, 152, -5, 0));                         // 水东（街）
  outer.push(box(194, GROUND + 5, 262, -151, -5, 109));                     // 园之西与南
  outer.push(box(172, GROUND + 5, 198, 152, -5, 149));                      // 南市
  outer.push(box(24, GROUND + 5, 180, 56, -5, 152));                        // 收尾：水尽处入地
  const om = mesh(outer, CITY);
  om.receiveShadow = true;
  om.name = 'city-ground';
  g.add(om);

  /* ------------------------------------------------------------- walks */
  const walks = [];
  // 门前 → 复廊 → 主山北麓
  walks.push(ribbon(GARDEN.corridor, 3.0, GROUND + 0.05, 0.86));
  walks.push(ribbon([[-6, W.zN + 1.2], [-6, -16], [-4, -10], [-2, -4]], 2.6, GROUND + 0.05, 0.7));
  // 堂前 月台 与 通往 观鱼处 的一径
  walks.push(ribbon([[4, 20.4], [2, 14], [0, 8]], 2.2, GROUND + 0.05, 0.6));
  walks.push(ribbon([[8, 22], [14, 20], [19, 17.5]], 1.9, GROUND + 0.05, 0.55));
  // 园西竹院前的小块平地上
  walks.push(ribbon([[-36, 21], [-38, 24], [-41, 28]], 1.7, GROUND + 0.05, 0.5));
  walks.push(mergeGeometries([box(11, 0.16, 7.4, -36, GROUND - 0.02, 26)]));
  // 碑廊前的地坪
  walks.push(mergeGeometries([box(GARDEN.steleWall.xTo - GARDEN.steleWall.xFrom + 4, 0.16, 5.2,
    (GARDEN.steleWall.xFrom + GARDEN.steleWall.xTo) / 2, GROUND - 0.02, GARDEN.steleWall.z - 2.6)]));
  const wm = mesh(walks, WALK);
  wm.receiveShadow = true;
  g.add(wm);

  /* ------------------------------------------------------------ the city */
  const city = buildCity();
  g.add(city.grp);

  scene.add(g);
  return { group: g, cityWindows: city.windows, materials: { EARTH, QUAY, WALK, CITY } };
}

/** a paved ribbon following a path: width, height above y=0, and a soft edge */
function ribbon(points, width, y, edgeFeather) {
  const p = points.map((q) => (q.length === 2 ? [q[0], y, q[1]] : q));
  const f = pathFrames(p, { steps: 6, y });
  const hw = width / 2;
  return quadGrid((u, v) => {
    const i = Math.min(f.pts.length - 1, Math.round(u * (f.pts.length - 1)));
    const c = f.pts[i], r = f.right[i];
    const t = (v - 0.5) * 2;                                  // -1..1 across the walk
    const off = t * hw * (1 + 0.12 * Math.abs(Math.sin(u * 9.1)));
    return [c.x + r.x * off, y + 0.02 - 0.05 * Math.pow(Math.abs(t), 3), c.z + r.z * off];
  }, Math.max(10, f.pts.length), 3, { spanU: f.length, spanV: width * edgeFeather });
}

/**
 * 民居: the roofs beyond the wall. Flat dark masses with a handful of lit
 * windows — they only have to say "the city is still out there".
 */
function buildCity() {
  const grp = new THREE.Group();
  grp.name = 'city';
  const bodies = [], windows = [];
  const rows = [
    // along the north bank of the river: the street that faces the garden
    { z: -58, x0: -170, x1: 70, depth: 11, h: [3.4, 6.2] },
    { z: -76, x0: -150, x1: 60, depth: 13, h: [3.2, 5.8] },
    // east of the arm and south of the garden
    { z: -6, x0: 76, x1: 170, depth: 12, h: [3.4, 6.0] },
    { z: 58, x0: -150, x1: 60, depth: 13, h: [3.2, 6.0] },
    { z: 84, x0: -120, x1: 70, depth: 15, h: [3.6, 7.0] },
    // west of the garden wall
    { z: 8, x0: -170, x1: -58, depth: 12, h: [3.4, 6.0] },
  ];
  for (const row of rows) {
    let x = row.x0;
    while (x < row.x1) {
      const w = rr(5, 11);
      const h = rr(row.h[0], row.h[1]);
      const z = row.z + rr(-2.6, 2.6);
      x += w / 2 + rr(0.4, 2.6);
      bodies.push(box(w, h, row.depth, x, GROUND - 0.4, z));
      // a low roof plate so the silhouette is not a stack of crates
      bodies.push(box(w + 0.8, 0.5, row.depth + 0.8, x, GROUND - 0.4 + h, z));
      const cols = Math.max(1, Math.round(w / 2.6));
      const lvl = Math.max(1, Math.round(h / 2.8));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < lvl; j++) {
          if (rand() > 0.12) continue;
          const wx = x - w / 2 + (i + 0.5) * (w / cols);
          const wy = GROUND + 1.4 + j * 2.8;
          if (wy > GROUND + h - 0.9) continue;
          windows.push(box(0.5, 0.62, 0.12, wx, wy - 0.31, z + row.depth / 2 + 0.02));
        }
      }
      x += w / 2;
    }
  }
  grp.add(mesh(bodies, CITY_LIT));
  const wm = mesh(windows, glow('#ffbb76', 0.5));
  wm.name = 'city-windows';
  grp.add(wm);
  return { grp, windows: wm };
}
