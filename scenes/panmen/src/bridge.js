import * as THREE from 'three';
import { M, glow, box, mesh } from './kit.js';
import { SITE, LEVEL } from './data.js';
import * as T from './textures.js';

const B = SITE.bridge;
const CY = B.crown - B.radius;                 // 拱圆心标高
const A = B.span / 2;                          // 半跨
/** 坦拱：拱脚处与水平线的夹角 φ = acos(半跨 / 半径)，圆弧走中间那一段 */
const PHI = Math.acos(Math.min(1, A / B.radius));
const TH1 = Math.PI - PHI, TH2 = PHI;
const HALF = B.length / 2;

/** 桥面上皮标高：拱段按圆，引桥段平滑落到堤面 */
function deckY(x) {
  const ax = Math.abs(x);
  if (ax <= A) return CY + Math.sqrt(Math.max(0, B.radius ** 2 - ax ** 2)) + B.deckT;
  const y0 = CY + Math.sqrt(Math.max(0, B.radius ** 2 - A ** 2)) + B.deckT;
  const y1 = LEVEL.quay + 0.3;
  const t = Math.min(1, (ax - A) / Math.max(0.001, HALF - A));
  return y0 + (y1 - y0) * (t * 0.55 + t * t * 0.45);
}

/** 半径 r 的一段圆弧面，沿 Z 拉出宽度：拱腹就靠它 */
function arcBand({ r, cy, t0, t1, width, seg = 30 }) {
  const pos = [], uv = [], idx = [];
  const nv = seg + 1;
  for (const z of [width / 2, -width / 2]) {
    for (let i = 0; i <= seg; i++) {
      const th = t0 + ((t1 - t0) * i) / seg;
      const x = Math.cos(th) * r, y = cy + Math.sin(th) * r;
      pos.push(x, y, z);
      uv.push((th - t0) * r / 2.4, z / 2.4);
    }
  }
  for (let i = 0; i < nv - 1; i++) {
    const a = i, b = i + 1, c = nv + i, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 桥身：一整块从河床下的基础升到桥面，中间只留一个券洞 */
function bridgeBody() {
  const shape = new THREE.Shape();
  shape.moveTo(-HALF, B.base);
  shape.lineTo(-HALF, deckY(-HALF));
  shape.lineTo(-A, CY + Math.sin(TH1) * B.radius + B.deckT);
  shape.absarc(0, CY, B.radius + B.deckT, TH1, TH2, true);
  shape.lineTo(HALF, deckY(HALF));
  shape.lineTo(HALF, B.base);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-A, B.sill);
  hole.lineTo(-A, CY + Math.sin(TH1) * B.radius);
  hole.absarc(0, CY, B.radius, TH1, TH2, true);
  hole.lineTo(A, B.sill);
  hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: B.width, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -B.width / 2);
  g.computeVertexNormals();
  return g;
}

/** 券脸：沿拱圈排一圈楔形石，两端落到券脚 */
function ringFace(depth = 0.4, ring = 0.52, count = 17) {
  const parts = [];
  const rc = B.radius + ring / 2;
  const springY = CY + Math.sin(TH1) * B.radius;
  for (let i = 0; i < count; i++) {
    const t0 = TH1 + ((TH2 - TH1) * i) / count;
    const t1 = TH1 + ((TH2 - TH1) * (i + 1)) / count;
    const tm = (t0 + t1) / 2;
    const chord = rc * Math.abs(t1 - t0) * 1.05;
    const g = new THREE.BoxGeometry(ring, chord, depth);
    g.rotateZ(tm - Math.PI / 2);
    g.translate(Math.cos(tm) * rc, CY + Math.sin(tm) * rc, 0);
    parts.push(g);
  }
  for (const s of [-1, 1]) {
    const h = springY - B.base + 0.7;
    const foot = new THREE.BoxGeometry(ring * 1.15, h, depth);
    foot.translate(s * rc, B.base + h / 2 - 0.3, 0);
    parts.push(foot);
  }
  const key = new THREE.BoxGeometry(ring * 1.3, B.radius * 0.28, depth * 1.2);
  key.translate(0, CY + rc + B.radius * 0.02, 0);
  parts.push(key);
  return parts;
}

/** 栏板与望柱沿桥面曲线立起来 */
function railing(side, lights) {
  const parts = [];
  const w = B.width / 2 - 0.2;
  const step = 1.7;
  for (let x = -HALF; x < HALF; x += step) {
    const len = Math.min(step, HALF - x);
    const y = deckY(x), ny = deckY(Math.min(HALF, x + len));
    const mid = (y + ny) / 2;
    const slope = Math.atan2(ny - y, len);
    // 构件一律先在原点摆好、转坡、再搬上桥：先搬后转会绕世界原点甩出去
    const put = (g, dy, dz) => { g.rotateZ(slope); g.translate(x + len / 2, mid + dy, side * (w + dz)); return g; };
    parts.push(put(box(0.26, B.railH + 0.3, 0.26), (B.railH + 0.3) / 2, 0));
    parts.push(put(box(0.34, 0.18, 0.34), B.railH + 0.32, 0));
    parts.push(put(box(len, B.railH * 0.62, 0.16), B.railH * 0.44, 0));
    parts.push(put(box(len, 0.22, 0.4), 0.1, 0));
  }
  // 柱头灯立在两肩、高出视平线：正中的那盏会正好糊在桥顶机位上
  for (const x of [-(A + 0.5), A + 0.5]) {
    lights.push({
      p: [x, deckY(x) + B.railH + 1.35, side * w],
      color: '#ffcf92', halo: 2.6, column: 3.4,
    });
  }
  return parts;
}

/** 桥头细节：系缆石与桥头灯。桥身侧面已是石面，不再叠多余的石皮 */
function approach(lights) {
  const stone = [];
  const xa = B.abutment.fromX;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = s * (xa - 1.2 - i * 2.4);
      const y = deckY(x);
      for (const k of [-1, 1]) {
        stone.push(box(0.5, 0.85, 0.5, x, y + 0.3, k * (B.width / 2 + 0.55)));
      }
    }
    lights.push({ p: [s * (xa + 1.6), LEVEL.quay + 4.4, 0], color: '#ffb066', halo: 2.2, column: 5 });
  }
  return { bollards: mesh(stone, M.stoneDressed) };
}

function addLamps(group, spots) {
  const lamps = [];
  for (const s of spots) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(s.color || '#ffcf92', 1.5));
    bulb.position.set(...s.p);
    group.add(bulb);
    if (s.halo) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,204,138', 0.14), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      sp.scale.setScalar(s.halo * 0.45);
      sp.position.set(...s.p);
      group.add(sp);
    }
    if (s.column) lamps.push({ p: new THREE.Vector3(...s.p), color: s.color, width: s.column * 0.5, depth: s.column });
  }
  group.userData.lamps = lamps;
  return lamps;
}

export function buildBridge(scene) {
  const group = new THREE.Group();
  group.name = 'wumen-bridge';
  const lights = [];

  // 桥身实体：券洞是真洞，船能穿过去
  group.add(mesh(bridgeBody(), M.brick));

  // 拱腹：一层圆柱面贴在洞顶，把 Extrude 的洞壁读成砌砖
  group.add(new THREE.Mesh(
    arcBand({ r: B.radius, cy: CY, t0: TH1, t1: TH2, width: B.width - 0.2 }),
    M.brickInner,
  ));

  // 桥面：一路铺到引桥，石板压在实体上
  const deck = [];
  for (let x = -HALF; x < HALF; x += 1.15) {
    const len = Math.min(1.15, HALF - x);
    const y = (deckY(x) + deckY(x + len)) / 2;
    const slab = box(len + 0.04, 0.16, B.width - 0.1);
    slab.rotateZ(Math.atan2(deckY(x + len) - deckY(x), len));
    slab.translate(x + len / 2, y + 0.02, 0);
    deck.push(slab);
  }
  group.add(mesh(deck, M.pavingWarm));

  const faces = [];
  for (const s of [1, -1]) {
    for (const geo of ringFace(0.42)) {
      geo.translate(0, 0, s * (B.width / 2 + 0.14));
      faces.push(geo);
    }
  }
  group.add(mesh(faces, M.stoneDressed));

  group.add(mesh(railing(1, lights), M.stoneDressed));
  group.add(mesh(railing(-1, lights), M.stoneDressed));

  // 桥心石：拱顶正中一块稍亮的条石
  group.add(mesh([box(2.3, 0.12, B.width - 0.8, 0, B.crown + B.deckT + 0.1, 0)], M.stone));

  // 桥额两面都刻，嵌在拱顶两侧的金刚墙上，不探到行人头前
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 2.6),
      new THREE.MeshStandardMaterial({ map: T.carving('吳門橋', { dir: 'v' }), roughness: 0.88, side: THREE.DoubleSide }),
    );
    plate.position.set(0, B.crown - 0.35, s * (B.width / 2 + 0.36));
    if (s < 0) plate.rotation.y = Math.PI;
    group.add(plate);
  }

  const ap = approach(lights);
  group.add(ap.bollards);

  // 券洞内一盏：船过桥洞时两岸的灯火都在洞外
  lights.push({ p: [0, B.crown - 1.5, 0], color: '#ffc47e', halo: 3.0, column: 9 });

  addLamps(group, lights);
  group.position.set(0, 0, B.z);
  scene.add(group);
  return { group, lights: group.userData.lamps, deckY, crown: B.crown + B.deckT };
}
