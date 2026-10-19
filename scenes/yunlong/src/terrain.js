import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, lit, glow, rand, rr, box, pathFrames, quadGrid } from './kit.js';
import * as T from './textures.js';
import { terrainHeight, LAKE, CITY, PATHS, SHORE, CITY_Y } from './data.js';

/**
 * 山之外的一切地坪：环内与山北的城地、滨湖的岸、长堤，以及今市的天际线。
 * 城只给体势与灯火——徐州今天的样子不可考，也不属于这一景的史实层，
 * 所以这里连高度都是按观感给的。
 */

const PLAIN = lit('#2b3138', { map: T.paving({ meters: 3.2, base: '#242a31' }), rough: 0.95 });
const QUAY = lit('#5a6268', { map: T.paving({ meters: 1.8, base: '#4e565c' }), rough: 0.9 });
const PATH_STONE = lit('#6a7178', { map: T.paving({ meters: 1.5, base: '#5f666c' }), rough: 0.9 });
const EARTH = lit('#333b3a', { map: T.paving({ meters: 2.6, base: '#2c3432' }), rough: 0.96 });
const FACADE = T.cityFacade();
const CITY_LIT = lit('#171d25', { map: FACADE, emissiveMap: FACADE, emissive: '#ffffff', ei: 0.72, rough: 0.86 });

export function buildTerrain(scene) {
  const g = new THREE.Group();
  g.name = 'terrain';

  /* ------------------------------------------------------- 环内与山北的地坪 */
  // 一整块铺到看见为止；西界留在湖岸以东，湖与山脚之间由水面自己收
  const plain = [box(1730, 6, 4200, 635, CITY_Y - 6, 0)];
  const pm = mesh(mergeGeometries(plain), PLAIN);
  pm.receiveShadow = true;
  pm.name = 'plain';
  g.add(pm);

  /* -------------------------------------------------------------- 滨湖岸 */
  const shore = [];
  const S = LAKE.shore;
  for (let i = 0; i < S.length - 1; i++) {
    const [x0, z0] = S[i], [x1, z1] = S[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // 贴水的一窄条石岸：长边顺着岸线，往外探 1.4 米压住水面接缝
    const seg = new THREE.BoxGeometry(len + 3, 1.5, 15);
    seg.rotateY(rot);
    seg.translate(cx, 0.95, cz);
    shore.push(seg);
  }
  const sm = mesh(mergeGeometries(shore), QUAY);
  sm.receiveShadow = true;
  sm.name = 'shore-quay';
  g.add(sm);

  /* -------------------------------------------------------------- 长堤 */
  const cw = LAKE.causeway;
  const embank = [];
  embank.push(box(cw.xTo - cw.xFrom, 1.35, cw.width, (cw.xFrom + cw.xTo) / 2, 0.2, cw.z));
  // 两侧矮护栏 + 每隔一段一个灯座
  for (const sz of [-1, 1]) {
    embank.push(box(cw.xTo - cw.xFrom, 0.5, 0.24, (cw.xFrom + cw.xTo) / 2, 1.1, cw.z + sz * (cw.width / 2 - 0.1)));
  }
  const lampSpots = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const x = cw.xFrom + 26 + (i * (cw.xTo - cw.xFrom - 52)) / (n - 1);
    for (const sz of [-1, 1]) {
      embank.push(box(0.5, 0.4, 0.5, x, 1.32, cw.z + sz * (cw.width / 2 - 0.5)));
      lampSpots.push([x, cw.z + sz * (cw.width / 2 - 0.5)]);
    }
  }
  const cm = mesh(mergeGeometries(embank), QUAY);
  cm.name = 'causeway';
  g.add(cm);

  /* -------------------------------------------------------------- 山道 */
  const walks = [];
  walks.push(ribbon(PATHS.west, 3.0));
  walks.push(ribbon(PATHS.east, 2.6));
  walks.push(ribbon(PATHS.south, 2.2));
  walks.push(ribbon(PATHS.causeway, 5.0, 1.52));
  const wm = mesh(mergeGeometries(walks.filter(Boolean)), PATH_STONE);
  wm.receiveShadow = true;
  wm.name = 'walks';
  g.add(wm);

  /* ------------------------------------------------------------ 今市 */
  const city = buildCity();
  g.add(city.grp);

  scene.add(g);
  return {
    group: g,
    cityWindows: city.windows,
    causewayLamps: lampSpots,
    materials: { PLAIN, QUAY, PATH_STONE, EARTH, CITY: PLAIN },
  };
}

/** 一条贴着高度场的石板路 */
function ribbon(points, width, fixedY = null) {
  if (!points || points.length < 2) return null;
  const p = points.map((q) => {
    const y = fixedY !== null ? fixedY : terrainHeight(q[0], q[1]) + 0.08;
    return [q[0], y, q[1]];
  });
  const f = pathFrames(p, { steps: 7 });
  const hw = width / 2;
  return quadGrid((u, v) => {
    const i = Math.min(f.pts.length - 1, Math.round(u * (f.pts.length - 1)));
    const c = f.pts[i], r = f.right[i];
    const t = (v - 0.5) * 2;
    const off = t * hw * (1 + 0.1 * Math.abs(Math.sin(u * 7.3)));
    return [c.x + r.x * off, c.y + 0.02 - 0.06 * Math.pow(Math.abs(t), 3), c.z + r.z * off];
  }, Math.max(12, f.pts.length), 3, { spanU: f.length, spanV: width });
}

/**
 * 城：暗体量 + 少量亮窗。夜里远处的楼只剩轮廓与窗，所以轮廓用大盒、
 * 窗用一片发光的小面，真灯一盏也不给它。
 */
function buildCity() {
  const grp = new THREE.Group();
  grp.name = 'city';
  const bodies = [], windows = [];

  for (const b of CITY.blocks) {
    const spanX = b.x1 - b.x0, spanZ = b.z1 - b.z0;
    const count = Math.round((spanX * spanZ) / 4200);
    for (let i = 0; i < count; i++) {
      const x = b.x0 + rand() * spanX;
      const z = b.z0 + rand() * spanZ;
      const y = groundAt(x, z);
      if (y > 8) continue;                       // 山坡上不长城
      const w = rr(9, 26), d = rr(8, 22), h = rr(b.h[0], b.h[1]);
      bodies.push(box(w, h, d, x, y - 0.4, z));
      bodies.push(box(w + 0.9, 0.7, d + 0.9, x, y - 0.4 + h, z));
      const cols = Math.max(1, Math.round(w / 3.4));
      const lvl = Math.max(1, Math.round(h / 3.2));
      for (let ci = 0; ci < cols; ci++) {
        for (let li = 0; li < lvl; li++) {
          if (rand() > 0.16) continue;
          const wx = x - w / 2 + (ci + 0.5) * (w / cols);
          const wy = y + 1.6 + li * 3.2;
          if (wy > y + h - 1.1) continue;
          windows.push(box(0.8, 0.9, 0.14, wx, wy - 0.45, z + d / 2 + 0.03));
        }
      }
    }
  }
  for (const t of CITY.towers) {
    const y = groundAt(t.x, t.z);
    bodies.push(box(22, t.h, 22, t.x, y - 0.5, t.z));
    bodies.push(box(9, 5.5, 9, t.x, y - 0.5 + t.h, t.z));
    for (let k = 0; k < 9; k++) {
      const wy = y + 4 + k * (t.h / 10);
      windows.push(box(14, 0.7, 0.16, t.x, wy, t.z + 11.1));
    }
  }

  // 湖对岸：一条压在水面之上的暗岸，几点窗——西岸不能悬在水里
  const wb = CITY.westBank;
  const bankY = 3.2;
  bodies.push(box(wb.x1 - wb.x0 + 120, bankY + 4, wb.z1 - wb.z0, (wb.x0 + wb.x1) / 2, -1.2, (wb.z0 + wb.z1) / 2));
  const perRow = 3;
  for (let i = 0; i < wb.rows * perRow; i++) {
    const x = wb.x0 + rand() * (wb.x1 - wb.x0);
    const z = wb.z0 + rand() * (wb.z1 - wb.z0);
    const w = rr(10, 20), d = rr(9, 16), h = rr(wb.h[0], wb.h[1]);
    bodies.push(box(w, h, d, x, bankY - 0.3, z));
    if (rand() > 0.4) windows.push(box(0.9, 0.9, 0.14, x, bankY + h * rr(0.3, 0.8), z + d / 2 + 0.03));
  }

  grp.add(mesh(mergeGeometries(bodies), CITY_LIT));
  const wm = mesh(mergeGeometries(windows), glow('#ffbe82', 0.42));
  wm.name = 'city-windows';
  grp.add(wm);
  return { grp, windows: wm };
}

function groundAt(x, z) {
  return Math.max(CITY_Y, terrainHeight(x, z) - 0.6);
}
