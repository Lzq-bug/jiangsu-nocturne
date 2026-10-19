import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { quadGrid, clamp01, lerp, smooth } from './kit.js';

/**
 * Roof surfaces for 江南 园林 建筑. Everything is returned as bare geometry in
 * local space — x along the front (面阔), z in depth (进深), y up — so the caller
 * can rotate it and bake it into the merged mesh of its material.
 *
 * Two things make a Chinese roof read: 举架 (the profile is steep at the ridge and
 * flattens toward the eave) and 起翘 (the corners flick up and the eave edge bows
 * outward at the ends). Both are baked into the surface, not added as trim.
 */

const PROFILE = 1.85;          // 举架: how much steeper the upper part is
const CORNER = 0.62;           // where along the span the corner begins to lift

/** vertical drop of the surface: `s` runs 0 at the ridge to 1 at the eave */
const drop = (s, rise) => rise * (1 - Math.pow(1 - clamp01(s), PROFILE));

/** 0 through most of the span, 1 at the two ends */
function cornerWeight(t) {
  const a = Math.abs(t) * 2;                        // t: -0.5..0.5
  return smooth(clamp01((a - CORNER) / (1 - CORNER)));
}

/**
 * A two-slope roof (硬山 / 悬山). `depth` is the full front-to-back run of the
 * surface. Returns { surface, ridge }.
 */
export function gabledRoof({
  span, depth, rise, eaveY = 0, lift = 0.5, cornerOut = 0.7,
  nu = 18, nv = 7, withRidge = true,
} = {}) {
  const hd = depth / 2, hs = span / 2;
  const ridgeY = eaveY + rise;

  const slope = (side) => quadGrid((u, v) => {
    const t = u - 0.5;
    const s = v;                                    // 0 ridge → 1 eave
    const cw = cornerWeight(t);
    const out = hd * s + cornerOut * cw * Math.pow(s, 1.7);
    const x = t * (span + 2 * cornerOut * cw * 0.35);
    const y = ridgeY - drop(s, rise) + lift * cw * Math.pow(s, 2.1);
    return [x, y, side * out];
  }, nu, nv, { spanU: span, spanV: hd * 1.25, flipU: side < 0 });

  const surface = mergeGeometries([slope(1), slope(-1)]);
  const parts = [];
  if (withRidge) {
    const g = new THREE.BoxGeometry(span + 0.6, 0.42, 0.52);
    g.translate(0, ridgeY + 0.2, 0);
    parts.push(g);
    for (const sx of [-1, 1]) {
      const tip = new THREE.BoxGeometry(0.44, 0.92, 0.6);
      tip.translate(sx * (hs + 0.34), ridgeY + 0.56, 0);
      parts.push(tip);
    }
  }
  return { surface, ridge: parts.length ? mergeGeometries(parts) : null };
}

/**
 * 山墙: the plaster panel that closes a 硬山 roof at each end. Its top edge
 * follows the roof: highest at the ridge line, down to the eave at both sides.
 * Built from `baseY` (the floor) up to `eaveY + the roof's local height`.
 */
export function slopeEndWall({ depth, rise, baseY = 0, eaveY = 0, thick = 0.34, pitch = 0.78 }) {
  return quadGrid((u, v) => {
    const z = (u - 0.5) * depth;
    const top = eaveY + rise * Math.max(0.05, 1 - (Math.abs(z) / (depth / 2)) * pitch);
    return [(v - 0.5) * thick, lerp(baseY, top, v), z];
  }, 14, 2, { spanU: depth, spanV: rise });
}

/**
 * A 攒尖 roof over a regular polygon: a ring of surface closing to the apex, the
 * four (or six) corners lifted and bowed outward. Returns { surface, apex }.
 */
export function pavilionRoof({
  half, rise, eaveY = 0, lift = 0.85, cornerOut = 0.6,
  sides = 4, perSide = 6, nv = 8,
} = {}) {
  const apexY = eaveY + rise;
  const n = sides * perSide;
  const sideNormal = (i) => {
    const a = (Math.PI * 2 * i) / sides + Math.PI / sides;
    return [Math.cos(a), Math.sin(a)];
  };
  const surface = quadGrid((u, v) => {
    const side = Math.min(sides - 1, Math.floor(u * sides));
    const t = u * sides - side - 0.5;               // -0.5..0.5 along this side
    const s = v;                                    // 0 apex → 1 eave
    const cw = cornerWeight(t);
    const [nx, nz] = sideNormal(side);
    const [px, pz] = sideNormal(side + (t > 0 ? 1 : -1));   // the corner's own normal
    const ox = lerp(nx, px, cw), oz = lerp(nz, pz, cw);     // out toward the diagonal
    const rx = -oz, rz = ox;                                // along the side
    const apothem = half;
    const radial = s * apothem * (1 + cornerOut * cw * 0.42);
    const tangential = t * 2 * apothem * Math.tan(Math.PI / sides) * s;
    const x = ox * radial + rx * tangential;
    const z = oz * radial + rz * tangential;
    const y = apexY - drop(s, rise) + lift * cw * Math.pow(s, 2.3);
    return [x, y, z];
  }, n, nv, { spanU: 2 * half * sides * 0.5, spanV: half * 1.4 });
  return { surface, apex: { y: apexY } };
}

/**
 * A wall cap: the little gabled tile roof crowning a garden wall, following a
 * polyline. `f` is a pathFrames result whose points already sit at cap height.
 */
export function wallCap(f, { width = 1.1, rise = 0.42, eaveDrop = 0.18 } = {}) {
  const pos = [], uv = [], idx = [];
  const hw = width / 2;
  const rows = [
    [-hw - 0.14, -eaveDrop], [-hw, 0.02], [-hw * 0.34, rise * 0.82],
    [0, rise], [hw * 0.34, rise * 0.82], [hw, 0.02], [hw + 0.14, -eaveDrop],
  ];
  const n = f.pts.length;
  for (let i = 0; i < n; i++) {
    const p = f.pts[i], r = f.right[i];
    for (const [ac, hh] of rows) {
      pos.push(p.x + r.x * ac, p.y + hh, p.z + r.z * ac);
      uv.push(f.dist[i], ac);
    }
  }
  const W = rows.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < W - 1; k++) {
      const a = i * W + k, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a ridge / eave line tube following a polyline, at `lift` above the path */
export function ridgeTube(f, { offset = 0, lift = 0, radius = 0.16, seg = 4 } = {}) {
  const pts = f.pts.map((p, i) => new THREE.Vector3(
    p.x + f.right[i].x * offset, p.y + lift, p.z + f.right[i].z * offset,
  ));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02);
  return new THREE.TubeGeometry(curve, Math.max(14, pts.length * 2), radius, seg, false);
}
