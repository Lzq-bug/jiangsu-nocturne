import * as THREE from 'three';
import { centerZ } from './data.js';

/**
 * 沿 X 扫掠的带体。profile(x) 给出该站的截面点列 [{z,y}…]，
 * closed 时首尾再连一面（用来做实心墙身；不闭口就是堤面、路肩这类薄带）。
 * 材质一律 DoubleSide，所以绕序不必纠结。
 */
export function ribbon(profile, xs, { closed = false, uScale = 26, vScale = 4 } = {}) {
  const nv = profile(xs[0]).length;
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < xs.length; s++) {
    const pts = profile(xs[s]);
    let run = 0;
    for (let i = 0; i < nv; i++) {
      if (i > 0) run += Math.hypot(pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y);
      pos.push(xs[s], pts[i].y, pts[i].z);
      uv.push(xs[s] / uScale, run / vScale);
    }
  }
  const segs = closed ? nv : nv - 1;
  for (let s = 0; s < xs.length - 1; s++) {
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % nv;
      const a = s * nv + i, b = s * nv + j, c = (s + 1) * nv + i, d = (s + 1) * nv + j;
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

/** 墙线上一点的方位角（绕 Y）：垛口、灯杆、台阶都要顺着它转 */
export function yawAt(x, h = 2) {
  return -Math.atan2(centerZ(x + h) - centerZ(x - h), 2 * h);
}

/** 墙上一点的世界坐标：dz 是相对中线的横向偏移（外为负、内为正），dy 是标高 */
export function at(x, dz, dy = 0) {
  return [x, dy, centerZ(x) + dz];
}

export function placeAt(d, x, dz, y) {
  d.position.set(x, y, centerZ(x) + dz);
  d.rotation.set(0, yawAt(x), 0);
  d.updateMatrix();
  return d;
}

export function range(from, to, step) {
  const out = [];
  for (let v = from; v <= to + 1e-6; v += step) out.push(v);
  return out;
}

export const dummy = () => new THREE.Object3D();
