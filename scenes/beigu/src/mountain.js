import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  M, mesh, lit, rand, rr, quadGrid, blobGeometry, pathFrames, roundedSection, loft,
} from './kit.js';
import * as T from './textures.js';
import { terrainHeight, southBank, steepness, TOP, TOP_Y, PLAIN, FEATURES } from './data.js';

/**
 * 北固山山体：三座丘自北而南叠成（后峰—中峰—前峰），高度场一张表算到底。
 * 陡度从网格法线读出来写进顶点色——崖面显石、缓坡显土；
 * 后峰顶是一张几乎平的平台（data.js 里平台的 rough 只有 0.34），寺观就落在它上面。
 */

/** 网格范围：横向在主峰周围加密（双曲映射），纵向盖到江中一点、城南一些 */
const ZC = 470, AZ = 553, BZ = 0.5;
const AX = 520, BX = 1.35;
const NU = 150, NV = 140;

const mapX = (p) => p * AX * (1 + BX * p * p);
const mapZ = (q) => ZC + q * AZ * (1 + BZ * q * q);

const XMIN = mapX(-1), XMAX = mapX(1);
const ZMIN = mapZ(-1), ZMAX = mapZ(1);

const VEG = new THREE.Color('#39463a');
const ROCK = new THREE.Color('#8a9298');
const SOIL = new THREE.Color('#4a4f45');

export function buildMountain(scene) {
  const group = new THREE.Group();
  group.name = 'mountain';

  const geo = quadGrid((u, v) => {
    const x = mapX(u * 2 - 1);
    const z = mapZ(v * 2 - 1);
    return [x, terrainHeight(x, z), z];
  }, NU, NV, { spanU: XMAX - XMIN, spanV: ZMAX - ZMIN });
  geo.computeVertexNormals();

  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const nor = geo.attributes.normal, pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const st = Math.min(1, Math.max(0, (0.955 - nor.getY(i)) / 0.22));
    const alt = Math.min(1, Math.max(0, (y - PLAIN) / 44));
    c.copy(SOIL).lerp(VEG, 0.55 - 0.35 * alt);
    c.lerp(ROCK, Math.min(1, st * 1.3));
    // 崖面被江气润过：冷一点、亮一点，免得整面崖是一团死黑
    const northFace = Math.min(1, Math.max(0, -nor.getZ(i)));
    c.b += 0.05 * northFace * st;
    c.r += 0.02 * northFace * st;
    // 平台与顶面受月光最直接
    c.multiplyScalar(0.86 + 0.34 * alt);
    // 滩地（贴近岸线那一圈）压暗并回蓝
    const b = southBank(x);
    if (z < b + 26) { const w = Math.min(1, (b + 26 - z) / 34); c.lerp(new THREE.Color('#2b3a40'), w * 0.6); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7e878b'),
    map: T.limestone({ meters: 20 }),
    roughness: 0.96, metalness: 0.02, vertexColors: true,
    emissive: new THREE.Color('#0b1015'), emissiveIntensity: 0.5,
  });
  const body = new THREE.Mesh(geo, mat);
  body.name = 'beigu-body';
  body.receiveShadow = true;
  group.add(body);

  /* ------------------------------------------------------------ 崖与坡的碎石 */
  group.add(buildScree());

  /* -------------------------------------------------------------- 顶平台 */
  const plat = buildTopTerrace();
  group.add(plat.grp);

  /* ------------------------------------------------------------ 登山石道 */
  group.add(buildPath());

  scene.add(group);

  return {
    group,
    heightAt: terrainHeight,
    terraceY: TOP_Y,
    top: TOP,
    /** 崖面上可挂灯的岩脊（x,y,z, 陡度） */
    cliffAnchors: plat.anchors,
    bounds: { XMIN, XMAX, ZMIN, ZMAX },
  };
}

/** 崖脚与坡上的乱石： blobGeometry 坐在高度场上，往下压一点免得浮起来 */
function buildScree() {
  const parts = [];
  const spots = [];
  // 北崖一线（后峰北面）
  for (let i = 0; i < 130; i++) {
    const a = rr(-1.25, -0.15) * Math.PI;
    const r = rr(150, 265);
    const x = TOP.x + Math.cos(a) * r * 1.05;
    const z = TOP.z + Math.sin(a) * r * 0.9;
    const y = terrainHeight(x, z);
    if (y < PLAIN + 2 || y > TOP_Y - 3) continue;
    spots.push([x, y, z]);
  }
  // 东坡与南坡各一批
  for (let i = 0; i < 110; i++) {
    const x = rr(-320, 560), z = rr(-160, 460);
    const y = terrainHeight(x, z);
    if (y < PLAIN + 3 || y > TOP_Y - 6) continue;
    spots.push([x, y, z]);
  }
  for (let i = 0; i < spots.length; i++) {
    const [x, y, z] = spots[i];
    const r = rr(0.7, 2.9);
    const g = blobGeometry(r, { detail: 1, amp: 0.34, squash: rr(0.42, 0.7), seed: i * 3.7 });
    g.rotateY(rand() * 3.1);
    g.translate(x, y - r * 0.24, z);
    parts.push(g);
  }
  if (!parts.length) return new THREE.Group();
  const m = mesh(mergeGeometries(parts), M.rockHill);
  m.name = 'scree';
  m.receiveShadow = true;
  return m;
}

/**
 * 顶平台：一块压平的台地 + 一圈挡土墙。
 * 寺、楼、塔、亭都要站在同一张平面上，所以这一层是把高度场抹平后另做的。
 */
function buildTopTerrace() {
  const grp = new THREE.Group();
  grp.name = 'top-terrace';
  const anchors = [];

  const pad = [
    { y: TOP_Y - 1.0, cx: TOP.x, cz: TOP.z, sx: 132, sz: 112 },
    { y: TOP_Y - 0.1, cx: TOP.x, cz: TOP.z, sx: 126, sz: 106 },
    { y: TOP_Y + 0.06, cx: TOP.x, cz: TOP.z, sx: 120, sz: 100 },
  ];
  const sect = roundedSection(0.3, 4);
  const g = loft(pad, sect, { uvScale: 4.2 });
  const deck = mesh(g, M.paving);
  deck.name = 'deck';
  deck.receiveShadow = true;
  grp.add(deck);

  // 挡土墙：沿平台外缘一圈条石，北面（临江）加倍高
  const wall = [];
  const ring = 46;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const px = TOP.x + Math.cos(a) * 122, pz = TOP.z + Math.sin(a) * 100;
    const gy = terrainHeight(px, pz);
    const north = Math.max(0, -Math.sin(a));
    const h = Math.max(1.2, (TOP_Y - gy) + 0.9 + north * 2.4);
    const seg = new THREE.BoxGeometry(17, h, 2.0);
    seg.rotateY(-a);
    seg.translate(px, gy + h / 2 - 0.6, pz);
    wall.push(seg);
    if (north > 0.35) anchors.push([px, gy + h * 0.4, pz]);
  }
  const wm = mesh(mergeGeometries(wall), M.stone);
  wm.name = 'deck-wall';
  wm.receiveShadow = true;
  grp.add(wm);

  return { grp, anchors };
}

/** 自南坡山口一路上到平台的石道（宽 3.2 米，贴着高度场） */
function buildPath() {
  const G = FEATURES.gate;
  const pts = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = TOP.x + G.dx * (1 - t) + Math.sin(t * 3.1) * 26;
    const z = TOP.z + (G.dz + 34) * (1 - t) + TOP_Y * 0 + t * 0;
    const y = terrainHeight(x, z) + 0.1;
    pts.push([x, y, z]);
  }
  const f = pathFrames(pts, { steps: 6 });
  const hw = 1.6;
  const g = quadGrid((u, v) => {
    const i = Math.min(f.pts.length - 1, Math.round(u * (f.pts.length - 1)));
    const c = f.pts[i], r = f.right[i];
    const t = (v - 0.5) * 2;
    return [c.x + r.x * t * hw, c.y - 0.05 * Math.pow(Math.abs(t), 3), c.z + r.z * t * hw];
  }, Math.max(24, f.pts.length), 3, { spanU: f.length, spanV: hw * 2 });
  const m = mesh(g, lit('#6b7278', { map: T.paving({ meters: 1.4, base: '#5f666c' }), rough: 0.92 }));
  m.name = 'path';
  m.receiveShadow = true;
  return m;
}
