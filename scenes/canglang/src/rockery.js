import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, mesh, pathFrames, lit, rand, rr, glow, blobGeometry } from './kit.js';
import * as T from './textures.js';
import { HILL, hillAt, GROUND } from './data.js';

/**
 * 黄石假山. The hill is the reason this garden is read as Song-dynasty: it is
 * stacked, not sculpted — horizontal shelves of yellow-brown stone with the
 * joints pressed against joints, a crest you can walk, and steps cut up one flank.
 *
 * So the surface is a smooth mass whose height gets *quantised into shelves*:
 * every flank point is snapped to a bedding plane and pushed back out to the
 * radius that plane belongs to. That single trick gives 叠石 without stacking
 * thousands of boxes.
 */

const SHELF = 0.62;              // 分层: the height of one course of stone
const NU = 46;                   // samples along the spine
const NV = 22;                   // samples down each flank
const DUST = new THREE.Color('#b3a48c');
const DAMP = new THREE.Color('#5b5f4c');
const MOSS = new THREE.Color('#5d7a52');

function quantize(y) {
  return Math.round(y / SHELF) * SHELF;
}

/** the crest line, its right vectors, and the foot radius at each sample */
function ridgeSamples() {
  const f = pathFrames(HILL.spine.map(([x, z]) => [x, 0, z]), { steps: Math.ceil(NU / (HILL.spine.length - 1)), y: 0 });
  const out = [];
  const n = NU;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = f.curve.getPoint(u);
    const t = f.curve.getTangent(u).setY(0).normalize();
    const right = new THREE.Vector3(-t.z, 0, t.x);
    const { y, w } = hillAt(u);
    out.push({ u, x: p.x, z: p.z, rx: right.x, rz: right.z, crest: y, foot: w });
  }
  return out;
}

/**
 * Radius of the hill at a given height. The whole silhouette lives here:
 * `prof` makes the mass batter outward toward the foot, 崖壁 positions raise the
 * exponent so their flanks stand almost vertical, and a mesa is inserted under
 * the pavilion so the 亭基 has something to sit on.
 */
function radiusAt(s, y) {
  const t = Math.max(0, Math.min(1, (y - HILL.baseY) / Math.max(0.8, s.crest - HILL.baseY)));
  const prof = Math.pow(1 - t, 1.25 * cliffFactor(s.u));
  const mesa = 3.6 * Math.exp(-Math.pow((s.u - HILL.pavilion.u) / 0.15, 2)) * Math.pow(Math.max(0, (t - 0.62) / 0.38), 1.3);
  return 0.5 + s.foot * prof + mesa;
}

/** 崖壁: where the flanks turn vertical — two heads on the long spine */
function cliffFactor(u) {
  return 1 + 1.5 * Math.exp(-Math.pow((u - 0.62) / 0.12, 2)) + 1.1 * Math.exp(-Math.pow((u - 0.16) / 0.1, 2));
}

/**
 * One flank of the hill. `side` is +1 or -1 across the spine. The flank is a
 * grid in (u, v): v runs 0 at the crest to 1 at the foot.
 */
function flank(ridge, side) {
  const pos = [], uv = [], col = [], idx = [];
  const jitter = [];
  for (let i = 0; i <= NU; i++) jitter.push([rr(-0.5, 0.5), rr(-0.35, 0.35)]);
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    for (let i = 0; i <= NU; i++) {
      const s = ridge[i];
      // smooth mass first…
      const ySmooth = s.crest - (s.crest - HILL.baseY + 0.5) * Math.pow(v, 1.12);
      // …then snap it onto a bedding plane, and re-solve the radius there. Each
      // course also steps in or out a little, which is what 叠石 actually does.
      const y = quantize(ySmooth) + (v > 0.9 ? 0 : rr(-0.05, 0.05));
      const course = Math.round(y / SHELF);
      const step = (course % 2 ? 0.26 : -0.2) + (course % 3) * 0.07;
      const r = radiusAt(s, y) + step + jitter[i][0] * (0.35 + v * 0.8);
      const x = s.x + s.rx * side * r + jitter[i][1] * v * 0.6;
      const z = s.z + s.rz * side * r + jitter[i][0] * v * 0.5;
      pos.push(x, y, z);
      uv.push(x / 2.6, y / 2.6);
      const t = Math.max(0, Math.min(1, (y - HILL.baseY) / Math.max(0.8, s.crest - HILL.baseY)));
      const c = new THREE.Color().copy(DAMP).lerp(DUST, 0.25 + t * 0.7);
      // damp and moss collect on the shaded lower flanks
      const shade = side > 0 ? 0.5 : 1;
      c.lerp(MOSS, Math.max(0, (1 - t) * 0.5 * shade - 0.08));
      col.push(c.r, c.g, c.b);
    }
  }
  const W = NU + 1;
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 山脊: the walkable crest ribbon between the two flanks */
function crestRibbon(ridge) {
  const pos = [], uv = [], col = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const s = ridge[i];
    const y = quantize(s.crest) + 0.1;
    const half = radiusAt(s, y) + 0.5;
    for (const side of [-1, 1]) {
      pos.push(s.x + s.rx * side * half, y, s.z + s.rz * side * half);
      uv.push(s.x / 2.6, s.z / 2.6);
      col.push(DUST.r, DUST.g, DUST.b);
    }
  }
  for (let i = 0; i < NU; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** the two heads and tails: close the mass so no sky shows through the ends */
function endCaps(ridge) {
  const parts = [];
  for (const i of [0, NU]) {
    const s = ridge[i];
    const rows = 8;
    const pos = [], uv = [], col = [], idx = [];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const y = quantize(s.crest - (s.crest - HILL.baseY + 0.5) * Math.pow(v, 1.12)) + 0.1;
      const r = radiusAt(s, y);
      for (const side of [-1, 1]) {
        pos.push(s.x + s.rx * side * r, y, s.z + s.rz * side * r);
        uv.push(side * r / 2.6, y / 2.6);
        col.push(DAMP.r, DAMP.g, DAMP.b);
      }
    }
    for (let j = 0; j < rows; j++) {
      const a = j * 2, b = a + 1, c = a + 2, d = c + 1;
      if (i === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return parts;
}

/** 蹬道: flat slabs cut up the south-east flank, each one lapped on the last */
function steps(ridge) {
  const parts = [];
  const N = 26;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const u = 0.72 - t * 0.3;                      // down toward the pavilion end
    const s = ridge[Math.round(u * NU)];
    const yTarget = HILL.baseY + 0.4 + t * (s.crest - HILL.baseY - 0.6);
    const y = quantize(yTarget) + 0.14;
    const r = radiusAt(s, y) - 0.5;
    const side = 1;
    const x = s.x + s.rx * side * r, z = s.z + s.rz * side * r;
    const g = new THREE.BoxGeometry(1.5, 0.2, 0.72);
    g.rotateY(Math.atan2(s.rx, s.rz) + rr(-0.12, 0.12));
    g.translate(x, y, z);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 石洞: a grotto under the foot of the hill — two jambs, a lintel, darkness */
function grotto(ridge) {
  const s = ridge[Math.round(0.5 * NU)];
  const x = s.x - s.rx * (s.foot * 0.42), z = s.z - s.rz * (s.foot * 0.42);
  const stone = [], dark = [];
  for (const sx of [-1, 1]) {
    stone.push(new THREE.BoxGeometry(0.7, 2.1, 1.6).translate(x + sx * 1.05, GROUND + 1.05, z - 0.2));
  }
  stone.push(new THREE.BoxGeometry(3.1, 0.5, 1.9).translate(x, GROUND + 2.3, z - 0.2));
  dark.push(new THREE.BoxGeometry(2.1, 1.9, 0.3).translate(x, GROUND + 0.95, z + 0.6));
  return { stone: mergeGeometries(stone), dark: mergeGeometries(dark), at: [x, z] };
}

/** 散石: boulders tumbled at the foot, so the hill lands rather than butts */
function boulders(ridge, material) {
  const parts = [];
  for (let i = 0; i < 34; i++) {
    const u = rand();
    const s = ridge[Math.round(u * NU)];
    const side = rand() > 0.5 ? 1 : -1;
    const r = s.foot * rr(0.9, 1.28);
    const w = rr(0.7, 2.1);
    const g = new THREE.BoxGeometry(w, rr(0.5, 1.3), rr(0.7, 1.9));
    g.rotateY(rand() * 3.2);
    g.rotateX(rr(-0.3, 0.3));
    g.rotateZ(rr(-0.25, 0.25));
    g.translate(s.x + s.rx * side * r + rr(-1, 1), GROUND + 0.1 + w * 0.18, s.z + s.rz * side * r + rr(-1, 1));
    parts.push(g);
  }
  const m = mesh(mergeGeometries(parts), material);
  m.name = 'hill-boulders';
  return m;
}

/** 古木 on the crest: the hill reads as old only if something grows out of it */
function hillTrees(ridge) {
  const trunks = [], canopy = [];
  const spots = [0.08, 0.2, 0.3, 0.76, 0.86, 0.94];
  for (const u of spots) {
    const s = ridge[Math.round(u * NU)];
    const off = rr(-1.4, 1.4);
    const x = s.x + s.rx * off, z = s.z + s.rz * off;
    const y = quantize(s.crest) + 0.1;
    const h = rr(3.4, 5.6);
    // a leaning trunk, slightly bent
    const segs = 5;
    let px = x, pz = z, py = y;
    const lean = rr(-0.16, 0.16);
    for (let k = 0; k < segs; k++) {
      const hh = h / segs;
      const r0 = 0.3 * (1 - k / segs) + 0.09;
      const g = new THREE.CylinderGeometry(r0 * 0.82, r0, hh + 0.1, 7);
      g.rotateZ(lean * (k + 1) * 0.2);
      g.translate(px, py + hh / 2, pz);
      trunks.push(g);
      px += Math.sin(lean * (k + 1) * 0.2) * hh * 0.4;
      pz += rr(-0.1, 0.1);
      py += hh;
    }
    // a canopy of three lobes
    for (let k = 0; k < 3; k++) {
      const r = rr(1.5, 2.5);
      const g = blobGeometry(r, { detail: 2, amp: 0.24, squash: 0.66, seed: u * 97 + k });
      g.translate(px + rr(-1.4, 1.4), py + rr(-0.4, 1.1), pz + rr(-1.4, 1.4));
      canopy.push(g);
    }
  }
  const grp = new THREE.Group();
  const tm = mesh(mergeGeometries(trunks), lit('#2f2a24', { map: T.noise(), rough: 0.95 }));
  tm.name = 'hill-trunks';
  const cm = mesh(mergeGeometries(canopy), M.foliage);
  cm.name = 'hill-canopy';
  grp.add(tm, cm);
  return grp;
}

/* ------------------------------------------------------------------ assembly */

export function buildHill(scene) {
  const ridge = ridgeSamples();
  const group = new THREE.Group();
  group.name = 'hill';

  const rock = M.rock;
  const parts = [flank(ridge, 1), flank(ridge, -1), crestRibbon(ridge), ...endCaps(ridge)];
  const hill = mesh(mergeGeometries(parts), rock);
  hill.name = 'hill-mass';
  group.add(hill);

  const gt = grotto(ridge);
  const st = steps(ridge);
  group.add(mesh([st, gt.stone], M.stone));
  group.add(mesh(gt.dark, M.silhouette));
  group.add(boulders(ridge, M.rockPlain));
  group.add(hillTrees(ridge));

  // a thin seam of lamp light along the 山径, so the steps are findable at night
  const pathLamps = [];
  for (let k = 2; k < 26; k += 5) {
    const t = k / 25;
    const u = 0.72 - t * 0.3;
    const s = ridge[Math.round(u * NU)];
    const y = quantize(HILL.baseY + 0.4 + t * (s.crest - HILL.baseY - 0.6)) + 0.14;
    const r = radiusAt(s, y) + 0.6;
    pathLamps.push([s.x + s.rx * r, y + 0.42, s.z + s.rz * r]);
  }
  const beads = pathLamps.map(([x, y, z]) => new THREE.SphereGeometry(0.11, 8, 6).translate(x, y, z));
  const bm = mesh(mergeGeometries(beads), glow('#ffd39a', 1.15));
  bm.name = 'hill-lamps';
  group.add(bm);

  scene.add(group);

  const pu = HILL.pavilion.u;
  const ps = ridge[Math.round(pu * NU)];
  const site = { x: ps.x, z: ps.z, y: quantize(ps.crest) + 0.24 };

  return {
    group,
    site,
    /** the crest elevation and half-width at a spine parameter, for the camera */
    crest: (u) => {
      const s = ridge[Math.max(0, Math.min(NU, Math.round(u * NU)))];
      return { y: quantize(s.crest) + 0.1, x: s.x, z: s.z };
    },
    lampAnchors: pathLamps,
  };
}
