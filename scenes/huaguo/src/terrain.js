import * as THREE from 'three';
import { groundAt, liandaoAt, SEA, LIANDAO, PATH, SITE, RESERVOIR } from './data.js';
import { lit, glow, mesh, box, rand, rr, pathFrames, quadGrid } from './kit.js';
import * as T from './textures.js';

/**
 * 一座立在两片水之间的山：西面是正在淤塞的内海，东面是黄海，东边海上还有连岛。
 * 高程全部从 data.js 的 groundAt 采样，所以机位、殿基、石级看到的是同一座山。
 * 山体分带用顶点色：岩、草、灌、滩一个 draw call，夜里靠高度把亮度抬起来。
 */

const ROCK = new THREE.Color('#8d949b');
const SOIL = new THREE.Color('#33402c');
const SCRUB = new THREE.Color('#3f4d34');
const MUD = new THREE.Color('#4c4e47');
const SAND = new THREE.Color('#5f5e53');

/** 一片按高度与坡度混色的山体；邻点差分求坡，不再多采样一次 */
function heightMesh({ x0, x1, z0, z1, nu, nv, fn = groundAt, meters = 26 }) {
  const nx = nu + 1, nz = nv + 1;
  const dx = (x1 - x0) / nu, dz = (z1 - z0) / nv;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * dz;
    for (let i = 0; i < nx; i++) h[j * nx + i] = fn(x0 + i * dx, z);
  }
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const idx = [];
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * dz;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * dx;
      const k = j * nx + i;
      const y = h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = (x - x0) / meters;
      uv[k * 2 + 1] = (z - z0) / meters;
      const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, nu);
      const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, nv);
      const gx = (h[j * nx + i1] - h[j * nx + i0]) / ((i1 - i0) * dx);
      const gz = (h[j1 * nx + i] - h[j0 * nx + i]) / ((j1 - j0) * dz);
      const sl = Math.hypot(gx, gz);
      if (y < 5.2) c.copy(MUD);
      else {
        c.copy(ROCK);
        const green = Math.max(0, 1 - sl * 0.92) * Math.max(0, 1 - (y - 6) / 470);
        if (green > 0) c.lerp(y > 200 ? SCRUB : SOIL, green * 0.88);
      }
      if (y > 2 && y < 11) c.lerp(SAND, Math.max(0, 0.5 - Math.abs(y - 6.5) / 9));
      // 高处亮一档：六百米的山在夜里不能是一团黑
      const lift = 0.86 + 0.24 * Math.min(1, y / 460);
      col[k * 3] = c.r * lift; col[k * 3 + 1] = c.g * lift; col[k * 3 + 2] = c.b * lift;
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTerrain(scene) {
  const g = new THREE.Group();
  g.name = 'terrain';

  /* ------------------------------------------------------------- 岛山 */
  const rockMat = lit('#93979a', {
    map: T.rockFace({ meters: 40 }), rough: 0.96, metal: 0.02, vertexColors: true,
    emissive: '#0b1116', ei: 0.32, side: THREE.DoubleSide,
  });
  const island = new THREE.Mesh(
    heightMesh({ x0: -1420, x1: 1180, z0: -1460, z1: 1460, nu: 248, nv: 208 }),
    rockMat,
  );
  island.name = 'island';
  g.add(island);

  /* ------------------------------------------------------------- 连岛 */
  const ld = new THREE.Mesh(
    heightMesh({
      x0: LIANDAO.x - LIANDAO.rx * 1.45, x1: LIANDAO.x + LIANDAO.rx * 1.45,
      z0: LIANDAO.z - LIANDAO.rz * 2.2, z1: LIANDAO.z + LIANDAO.rz * 2.2,
      nu: 92, nv: 52, fn: (x, z) => Math.max(liandaoAt(x, z), -22), meters: 34,
    }),
    rockMat,
  );
  ld.name = 'liandao';
  g.add(ld);

  /* ----------------------------------------------------------- 西大堤 */
  const cw = LIANDAO.causeway;
  const embank = [];
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const z = cw.z0 + (cw.z1 - cw.z0) * (i / (segs - 1));
    const w = cw.width * (0.86 + 0.28 * Math.sin(i * 0.7));
    embank.push(box(w, 9, (cw.z1 - cw.z0) / (segs - 1) * 1.05, cw.x + 9 * Math.sin(z * 0.0016), cw.y - 4.6, z));
  }
  const causeway = mesh(embank, lit('#5c6165', { map: T.mudflat({ meters: 22 }), rough: 0.94 }));
  causeway.name = 'causeway';
  g.add(causeway);

  /* -------------------------------------------------- 山道：石级一径 */
  const frames = pathFrames(PATH.map(([x, z]) => [x, groundAt(x, z), z]), { steps: 7 });
  const pathGeo = quadGrid((u, v) => {
    const i = Math.min(frames.pts.length - 1, Math.round(u * (frames.pts.length - 1)));
    const p = frames.pts[i], r = frames.right[i];
    const off = (v - 0.5) * 3.4;
    const x = p.x + r.x * off, z = p.z + r.z * off;
    return [x, groundAt(x, z) + 0.34, z];
  }, frames.pts.length - 1, 3, { spanU: frames.length / 1.6, spanV: 2 });
  const stepsMat = lit('#818890', {
    map: T.steps({ count: 12 }), rough: 0.9, side: THREE.DoubleSide,
    emissive: '#12191f', ei: 0.26,
  });
  const pathMesh = new THREE.Mesh(pathGeo, stepsMat);
  pathMesh.name = 'climbing-path';
  g.add(pathMesh);

  /* ------------------------------------------------- 旧海岸：山脚那一线 */
  const shorePts = [];
  for (let z = -1180; z <= 1180; z += 42) {
    const x = SEA.oldShore(z);
    shorePts.push([x, groundAt(x, z) + 0.6, z]);
  }
  const sf = pathFrames(shorePts, { steps: 3 });
  const shoreGeo = quadGrid((u, v) => {
    const i = Math.min(sf.pts.length - 1, Math.round(u * (sf.pts.length - 1)));
    const p = sf.pts[i], r = sf.right[i];
    const off = (v - 0.5) * 7;
    const x = p.x + r.x * off, z = p.z + r.z * off;
    return [x, groundAt(x, z) + 0.26, z];
  }, sf.pts.length - 1, 2, { spanU: sf.length / 12, spanV: 2 });
  const shore = new THREE.Mesh(shoreGeo, lit('#6d706a', {
    map: T.paving({ meters: 3.2, base: '#5f6259' }), rough: 0.92, side: THREE.DoubleSide,
    emissive: '#0d1418', ei: 0.18,
  }));
  shore.name = 'old-shore';
  g.add(shore);

  /* --------------------------------------------- 山前平野上的村与街 */
  const town = buildTown();
  g.add(town.grp);
  g.add(buildFields());
  g.add(buildIsles());

  scene.add(g);
  return {
    group: g,
    townWindows: town.windows,
    shoreLamps: town.shoreLamps,
    townLamps: town.townLamps,
    causewayLamps: causewayLamps(cw),
    peakFlag: [LIANDAO.x + 34, LIANDAO.y - 2, LIANDAO.z - 20],
    materials: { rockMat, stepsMat },
    pathLength: frames.length,
  };
}

/**
 * 淤出来的平野上现在是街：低矮的屋群、窗里几点暖光，外加港口那一排冷光。
 * 它们只说明"海退了，城进了"，不给任何名号。
 */
function buildTown() {
  const grp = new THREE.Group();
  grp.name = 'town';
  const bodies = [], windows = [], shoreLamps = [], townLamps = [];
  const houses = [];
  // 塔前、桥头、宫前不能戳房子——静帧里那就是一堵黑墙
  const KEEP = [[SITE.pagoda.x, SITE.pagoda.z, 150, 120], [SITE.gate.x, SITE.gate.z, 120, 90],
    [SITE.bridge.x, SITE.bridge.z, 110, 70], [RESERVOIR.x, RESERVOIR.z, 210, 160]];
  function nearLandmark(x, z) {
    return KEEP.some(([kx, kz, hw, hh]) => Math.abs(x - kx) < hw && Math.abs(z - kz) < hh);
  }
  const rows = [
    { x0: -1240, x1: -740, z: 430, h: [4, 9], n: 40 },
    { x0: -1250, x1: -760, z: -360, h: [4, 8.4], n: 36 },
    { x0: -1180, x1: -800, z: -780, h: [3.6, 7.2], n: 20 },
    { x0: 950, x1: 1150, z: -260, h: [3.4, 6.6], n: 13 },
    { x0: 960, x1: 1140, z: 380, h: [3.4, 6.4], n: 11 },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const x = rr(row.x0, row.x1);
      const z = row.z + rr(-72, 72);
      const w = rr(6, 15), dp = rr(5, 11), h = rr(row.h[0], row.h[1]);
      const y = groundAt(x, z);
      if (y < 2.4 || slopeRough(x, z) > 0.55) continue;
      if (nearLandmark(x, z)) continue;
      bodies.push(box(w, h, dp, x, y - 0.6, z));
      bodies.push(box(w + 1, 0.7, dp + 1, x, y - 0.6 + h, z));
      const cols = Math.max(1, Math.round(w / 3.4));
      for (let k = 0; k < cols; k++) {
        if (rand() > 0.3) continue;
        windows.push(box(0.7, 0.8, 0.14, x - w / 2 + (k + 0.5) * (w / cols),
          y + 1.9 + rand() * Math.max(0.4, h - 3), z + dp / 2 + 0.04));
      }
      if (rand() > 0.6) townLamps.push([x + w / 2 + 1.4, y + 3.6, z]);
    }
  }
  // 旧海岸线上的一串：当年是渡口与盐步，如今只剩街灯的位置
  for (let z = -1120; z <= 1120; z += 58) {
    const x = SEA.oldShore(z) + rr(-9, 9);
    const y = groundAt(x, z);
    if (y < 2.4 || y > 26) continue;
    shoreLamps.push([x, y + 2.6, z]);
  }
  houses.push(mesh(bodies, lit('#5d666c', {
    map: T.plaster({ meters: 9, base: '#606b70' }), rough: 0.95, side: THREE.DoubleSide,
    emissive: '#1a242c', ei: 0.42,
  })));
  for (const hh of houses) grp.add(hh);
  const wm = mesh(windows, glow('#ff9f5e', 0.45));
  wm.name = 'town-windows';
  grp.add(wm);
  return { grp, windows: wm, shoreLamps, townLamps };
}

/** 田与滩：把山脚到水边那段空填住，不让平野在夜里塌成一片死黑 */
function buildFields() {
  const parts = [];
  const bands = [
    { x0: -1300, x1: -700, z0: -250, z1: 60 },
    { x0: -1300, x1: -700, z0: 250, z1: 420 },
    { x0: -1260, x1: -760, z0: -780, z1: -560 },
    { x0: 900, x1: 1160, z0: -80, z1: 320 },
  ];
  for (const b of bands) {
    parts.push(quadGrid((u, v) => {
      const x = b.x0 + u * (b.x1 - b.x0), z = b.z0 + v * (b.z1 - b.z0);
      return [x, groundAt(x, z) + 0.32, z];
    }, 24, 11, { spanU: (b.x1 - b.x0) / 34, spanV: (b.z1 - b.z0) / 34 }));
  }
  const m = mesh(parts, lit('#4d5542', { map: T.mudflat({ meters: 34 }), rough: 0.97, side: THREE.DoubleSide }));
  m.name = 'fields';
  return m;
}

/** 海中的几个远屿：给鸟瞰收口，也让"山曾经是岛"这件事有个伴 */
function buildIsles() {
  const specs = [
    { x: -520, z: -1980, w: 300, h: 150 },
    { x: -120, z: 1980, w: 260, h: 118 },
    { x: 820, z: 1880, w: 210, h: 92 },
    { x: -1240, z: -1880, w: 180, h: 74 },
    { x: 1500, z: -1500, w: 220, h: 86 },
  ];
  const parts = [];
  for (const s of specs) {
    const ridge = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const z = s.z - 300 + t * 600;
      const y = s.h * Math.sin(Math.PI * t) ** 0.8 * (0.72 + 0.4 * Math.sin(t * 7 + s.x));
      ridge.push([s.x + 70 * Math.sin(t * 3.4 + s.z * 0.002), Math.max(y, -6), z]);
    }
    const f = pathFrames(ridge, { steps: 4 });
    parts.push(quadGrid((u, v) => {
      const i = Math.min(f.pts.length - 1, Math.round(u * (f.pts.length - 1)));
      const p = f.pts[i], r = f.right[i];
      const t = (v - 0.5) * 2;
      const drop = Math.pow(Math.abs(t), 2.2) * (p.y + 40);
      return [p.x + r.x * t * s.w, Math.max(p.y - drop, -40), p.z + r.z * t * s.w];
    }, f.pts.length - 1, 5, { spanU: f.length / 30, spanV: s.w / 30 }));
  }
  const m = mesh(parts, lit('#464f52', {
    map: T.rockFace({ meters: 44 }), rough: 0.96, vertexColors: false, side: THREE.DoubleSide,
    emissive: '#0a1014', ei: 0.4,
  }));
  m.name = 'isles';
  return m;
}

function slopeRough(x, z) {
  const d = 14;
  return Math.hypot(groundAt(x + d, z) - groundAt(x - d, z), groundAt(x, z + d) - groundAt(x, z - d)) / (2 * d);
}

function causewayLamps(cw) {
  const out = [];
  for (let i = 0; i <= 20; i++) {
    const z = cw.z0 + (cw.z1 - cw.z0) * (i / 20);
    out.push([cw.x, cw.y + 7, z]);
  }
  return out;
}
