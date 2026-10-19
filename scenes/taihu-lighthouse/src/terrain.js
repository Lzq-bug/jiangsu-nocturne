import * as THREE from 'three';
import { GEO, LAKE } from './data.js';
import { M, rand, rr, mesh, box, registerOccluder } from './kit.js';
import * as T from './textures.js';

/**
 * A headland driven into the lake: land to the south-east, open water to the
 * north and west. Every height in the scene comes from elev(), so props,
 * cameras and the surf line all agree on where the shore is.
 */

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;

/** land masses: a big body of hills to the north-east, and the spit driven south into the lake.
 *  hk 控制该块地形的起伏权重——石咀必须低平，否则机位会爬得比灯塔还高。 */
const LAND = [
  { x: 470, z: -520, a: 660, b: 560, h: 38, hk: 1 },      // 充山—鹿顶山腹地
  { x: 180, z: -300, a: 330, b: 280, h: 24, hk: 0.7 },    // 北丘与谷地
  { x: 24, z: 60, a: 116, b: 240, h: 16, hk: 0.16 },      // 石咀（北—南窄脊）
  { x: -20, z: 214, a: 74, b: 74, h: 13, hk: 0.1 },       // 尖端礁台
];
/** 内湖（长春湖）与从它北口引出的短浜：长春桥就跨在短浜上 */
const BAY = [GEO.bay];
const CREEK = { x: GEO.bridge.x, z: GEO.bridge.z - 28, a: 22, b: 70 };
/** 人工整平：塔基、尖端平台、码头、桥堤、楼基，最后一级把尖端收成礁石滩 */
const FLATS = [
  // 长春湖西北岸的临湖阶地：长春桥、樱花谷、赏樱楼都落在这道台上，
  // 不加这一级，24 米的北丘会直接插进水里，桥下就成一个采石场坑
  { x: 250, z: -112, r: 132, y: 5.5, soft: 156 },
  { x: GEO.light.x, z: GEO.light.z, r: 30, y: GEO.light.padY, soft: 26 },
  { x: GEO.platform.x, z: GEO.platform.z, r: GEO.platform.r, y: GEO.platform.y, soft: 13 },
  { x: GEO.pier.x, z: GEO.pier.z, r: 24, y: GEO.pier.deckY, soft: 22 },
  { x: GEO.bridge.x, z: GEO.bridge.z, r: 26, y: 5.2, soft: 46 },
  { x: GEO.pavilion.x, z: GEO.pavilion.z, r: 20, y: GEO.pavilion.y, soft: 40 },
  { x: GEO.point.x, z: GEO.point.z, r: 26, y: 3.2, soft: 54 },
];

/** 0 outside the ellipse edge, 1 well inside, transition ~feather meters */
function landAt(x, z, c, feather = 16) {
  const d = Math.hypot((x - c.x) / c.a, (z - c.z) / c.b);
  const m = (1 - d) * Math.min(c.a, c.b);
  return smooth(-feather, feather, m);
}

/** low-amplitude ridges: two octaves of sines, deterministic and cheap */
function hills(x, z) {
  return Math.sin(x * 0.0072 + 1.3) * Math.cos(z * 0.0091 - 0.6) * 13
    + Math.sin((x + z) * 0.0155) * 6
    + Math.sin(x * 0.031 - z * 0.022) * 2.4
    + Math.sin(x * 0.083 + 1.7) * Math.sin(z * 0.071 - 0.4) * 1.1;
}

/** how much of the water level this spot sits above ground — negative means submerged */
export function elev(x, z) {
  let sum = 0, acc = 0, akk = 0;
  for (const c of LAND) {
    const f = landAt(x, z, c);
    if (f <= 0) continue;
    acc += c.h * f;
    akk += c.hk * f;
    sum += f;
  }
  const land = clamp(sum, 0, 1);
  const w = Math.max(sum, 1);
  // blob 的 h 就是这块地的绝对高程，水下收到 lakebed
  let h = lerp(LAKE.lakebed, acc / w + hills(x, z) * (akk / w), land);

  // the spit is rocky and lumpy; the mainland keeps its long swells
  const spit = landAt(x, z, LAND[2], 24);
  h += Math.sin(x * 0.062 + 0.9) * Math.cos(z * 0.055) * 2.6 * spit * land;

  for (const b of BAY) h = lerp(h, LAKE.lakebed * 0.7, landAt(x, z, b, 18));

  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    const k = smooth(f.r + f.soft, f.r * 0.4, d);
    h = lerp(h, f.y, k * 0.9);
  }

  // 短浜必须在整平之后切：否则桥台地会把自己要跨的水道填平
  h = lerp(h, LAKE.lakebed * 0.7, landAt(x, z, CREEK, 14));

  // 整平之后地面不能是镜面：留一点细起伏，否则一大片台地像停车场
  h += (Math.sin(x * 0.29 + 1.1) * Math.cos(z * 0.26 - 0.7) * 0.34
      + Math.sin(x * 0.83) * Math.sin(z * 0.71) * 0.16) * land;

  // 域边推到远山剪影之后：陆地一侧往前提一道脊收进雾里，湖一侧留在水下
  const rim = smooth(1700, 2450, Math.max(Math.abs(x), Math.abs(z)));
  h += rim * (6 + 16 * land) * land;
  return h;
}

export const isLand = (x, z) => elev(x, z) > 0.45;
/** shortest distance to the shoreline, positive on land (surf fades with this) */
export function shoreDist(x, z) {
  const e = elev(x, z);
  if (Math.abs(e) > 9) return e;
  // height gradient converts metres-above-water into metres-from-shore
  const g = Math.hypot(elev(x + 2, z) - e, elev(x, z + 2) - e) / 2;
  return e / Math.max(0.12, g);
}
export function slopeAt(x, z) {
  const d = 3;
  const dx = (elev(x + d, z) - elev(x - d, z)) / (2 * d);
  const dz = (elev(x, z + d) - elev(x, z - d)) / (2 * d);
  return Math.hypot(dx, dz);
}

/** sample a point on land by walking out from a target until the ground clears the water */
export function findLand(x, z, minElev = 1.2, steps = 40) {
  for (let i = 0; i < steps; i++) {
    const e = elev(x, z);
    if (e > minElev) return { x, z, y: e };
    x += rr(-9, 9); z += rr(-9, 9);
  }
  return null;
}

/* ------------------------------------------------------------------ geometry */

const N_GRID = 300;
const SPAN = 2600;
/** 近密远疏：u∈[-1,1] 战报到世界米，石咀一带 ~3m，远处 ~16m */
const warp = (u) => SPAN * Math.sign(u) * Math.pow(Math.abs(u), 1.8);

function heightField() {
  const n = N_GRID + 1;
  const pos = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const col = new Float32Array(n * n * 3);
  const cGrass = new THREE.Color('#4d665a');
  const cRock = new THREE.Color('#8b93a1');
  const cSand = new THREE.Color('#5f6672');
  const cDeep = new THREE.Color('#1a222e');
  const tmp = new THREE.Color();
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = warp(-1 + (2 * i) / N_GRID);
      const z = warp(-1 + (2 * j) / N_GRID);
      const y = elev(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      // 没有 uv 的话石材贴图完全不生效，地面会糊成一片死黑
      uvs[k * 2] = x * 0.22; uvs[k * 2 + 1] = z * 0.22;
      const s = slopeAt(x, z);
      tmp.copy(y < 0.6 ? cDeep : cGrass);
      tmp.lerp(cRock, smooth(0.16, 0.55, s));
      if (y > 0.6 && y < 3.4) tmp.lerp(cSand, smooth(3.4, 0.6, y) * 0.7);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      k++;
    }
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  // 泥砂草坡的斑驳就够，别用砌块缝：整片台地上会排成停车场
  const map = T.plaster('#99a190');
  map.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, map, roughness: 0.95, metalness: 0,
  });
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}

/** one lumpy boulder, reused everywhere at different scales */
function boulderGeo() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = 1 + 0.3 * Math.sin(x * 3.1 + y * 2.2) * Math.cos(z * 2.7) + 0.12 * Math.sin(y * 7.1);
    p.setXYZ(i, x * r * 1.25, y * r * 0.72, z * r);
  }
  g.computeVertexNormals();
  return g;
}

/** the 鼋头 rock itself: slabs of outcrop running out into the water */
function headRock() {
  const g = GEO.point;
  const grp = new THREE.Group();
  const slabs = [
    [14, 2.6, 10, -4, 6, 0.3],
    [10, 2.0, 8, 7, 12, -0.5],
    [7, 1.6, 6, -12, 14, 1.1],
    [5, 1.2, 4, 2, 21, 2.4],
    [9, 1.8, 7, -16, 2, 0.8],
  ];
  for (const [w, h, d, ox, oz, rot] of slabs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.rockWet);
    m.position.set(g.x + ox, elev(g.x + ox, g.z + oz) + h * 0.25, g.z + oz);
    m.rotation.set(rr(-0.05, 0.05), rot, rr(-0.06, 0.06));
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  }
  // 走到石头跟前就收掉，不然几块大石会把镜头糊住
  return registerOccluder(grp, 12, new THREE.Vector3(g.x, 4, g.z));
}

function boulderField() {
  const geo = boulderGeo();
  const grp = new THREE.Group();
  const dummy = new THREE.Object3D();
  const spots = [];
  // the shore of the spit is rock, the mainland shore stays grassy
  for (let a = 0; a < Math.PI * 2; a += 0.13) {
    for (let r = 55; r < 300; r *= 1.16) {
      const x = 16 + Math.cos(a) * r * 0.55;
      const z = 60 + Math.sin(a) * r * 0.92;
      const e = elev(x, z);
      if (e > -1.6 && e < 5.5 && slopeAt(x, z) > 0.2 && rand() > 0.42) spots.push([x, z, e]);
    }
  }
  const im = new THREE.InstancedMesh(geo, M.rock, spots.length);
  spots.forEach(([x, z, e], i) => {
    const s = rr(0.9, 3.4);
    dummy.position.set(x, e - s * 0.22, z);
    dummy.rotation.set(rr(-0.3, 0.3), rand() * 6.28, rr(-0.3, 0.3));
    dummy.scale.set(s * rr(0.8, 1.3), s * rr(0.6, 1), s * rr(0.8, 1.3));
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = im.receiveShadow = true;
  grp.add(im);
  return grp;
}

/** 尖端平台：整平的石材台面 + 环湖栏杆，脚下就是拍岸浪 */
function tipPlatform() {
  const t = GEO.platform;
  const grp = new THREE.Group();
  const r = t.r;
  // 台面坐在一直插到水下的挡墙上：悬空的薄盘从下面看就是天花板，
  // 底部留缝则会在地平线上切出一道黑带
  const deckH = t.y + 2;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.6, deckH, 30, 1), M.stoneDressed);
  deck.position.set(t.x, t.y + 0.75 - deckH / 2, t.z);
  deck.receiveShadow = deck.castShadow = true;
  grp.add(deck);

  // rail all the way round except the land-side entrance
  const gap = [0.6, 2.3];
  const seg = 26;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    if (a > gap[0] && a < gap[1]) continue;
    const px = t.x + Math.cos(a) * (r - 1.1), pz = t.z + Math.sin(a) * (r - 1.1);
    const post = mesh([
      box(0.16, 1.05, 0.16, 0, 0.52, 0),
      box(0.11, 0.52, 0.11, 0, 0.3, 0.13),
      box(0.11, 0.52, 0.11, 0, 0.3, -0.13),
    ], M.stoneDressed);
    post.position.set(px, t.y, pz);
    post.rotation.y = -a;
    grp.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M.stoneDressed);
    cap.position.set(px, t.y + 1.1, pz);
    grp.add(cap);
  }
  const arcFrom = gap[1], arcLen = Math.PI * 2 - (gap[1] - gap[0]);
  for (const [y, tube, mat] of [[1.02, 0.09, M.stoneDressed], [0.34, 0.13, M.stone]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r - 1.1, tube, 6, 72, arcLen), mat);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = -arcFrom;
    band.position.set(t.x, t.y + y, t.z);
    grp.add(band);
  }
  return grp;
}

/**
 * 灯塔之后的刻石：高两米余，正面「鼋头渚」，背面「鼋渚春涛」。
 * 两面都要有字——从湖这一侧走过来的人先看见的是背面。
 */
function markerStele() {
  const s = GEO.stele;
  const grp = new THREE.Group();
  const body = mesh([
    box(3.4, 2.3, 0.62, 0, 1.15, 0),
    box(4.0, 0.34, 1.0, 0, 0.17, 0),
    box(3.9, 0.3, 0.86, 0, 2.44, 0),
  ], M.stone);
  body.castShadow = body.receiveShadow = true;
  grp.add(body);
  const face = (text, z, ry) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 1.7),
      new THREE.MeshBasicMaterial({
        map: T.plaque(text, { dir: 'h', bg: '#2a2e37', fg: '#e6d3a6', border: '#6d6a5d' }),
        toneMapped: false,
      }),
    );
    m.position.set(0, 1.2, z);
    m.rotation.y = ry;
    return m;
  };
  grp.add(face('鼋头渚', 0.32, 0), face('鼋渚春涛', -0.32, Math.PI));
  grp.position.set(s.x, elev(s.x, s.z), s.z);
  grp.rotation.y = s.rot;
  return grp;
}

/** stone paving under the lighthouse and a low retaining wall on the lake side */
function lighthousePad() {
  const g = GEO.light;
  const grp = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(17, 18.2, 1.1, 26, 1), M.stoneDressed);
  pad.position.set(g.x, g.padY - 0.5, g.z);
  pad.receiveShadow = true;
  grp.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 0.3, 5, 40), M.stone);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(g.x, g.padY + 0.12, g.z);
  grp.add(ring);
  return grp;
}

/* ------------------------------------------------------------------ assemble */

export const MAP_HALF = 1100;
let depthTex = null;
/**
 * 地形高程烘成一张纹理：水面与灯塔光扇都要在 shader 里知道"这一块是陆地还是水"，
 * 靠顶点属性做不到这么细，直接查图。
 */
export function depthTexture() {
  if (depthTex) return depthTex;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const wx = -MAP_HALF + (i / (N - 1)) * 2 * MAP_HALF;
      const wz = -MAP_HALF + (j / (N - 1)) * 2 * MAP_HALF;
      const v = Math.round(Math.max(0, Math.min(1, (elev(wx, wz) + 24) / 32)) * 255);
      const o = (j * N + i) * 4;
      img.data[o] = v; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  depthTex = new THREE.CanvasTexture(c);
  // CanvasTexture 默认 flipY，会把整张图沿 z 镜像：远处湖面被读成陆地，
  // 浅水与泡沫就铺满了整片太湖
  depthTex.flipY = false;
  depthTex.colorSpace = THREE.NoColorSpace;
  depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
  depthTex.needsUpdate = true;
  return depthTex;
}

export function buildTerrain(scene) {
  const grp = new THREE.Group();
  grp.name = 'terrain-group';
  grp.add(heightField(), boulderField(), headRock(), tipPlatform(), markerStele(), lighthousePad());
  scene.add(grp);
  return { group: grp, elev, isLand, shoreDist, slopeAt };
}
