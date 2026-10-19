/**
 * 标高：纯函数，只依赖 data.js，不 import three、不碰 DOM。
 * 因此可以 `node maoshan/tools/relief-check.mjs` 直接把各峰顶、台基与机位的高度打出来，
 * 不必等一轮四十分钟的无头连拍才发现相机埋在山体里。
 *
 * 两处口径要留意：
 *  · 峰高不是直接写死的 h，而是按志书海拔 alt 反解出来的振幅——几座峰相邻时
 *     bumps 会互相叠加，不反解的话二茅峰会长到大茅峰的肩上去。
 *  · 台基不指定高程，只指定中心与尺寸，落在"该处自然地面"上（挖填各自一半），
 *    手写高程必然与峰形打架，台基边缘就成陡坎。
 */
import { EXTENT, FOOT_Y, MOUNT, PADS, PATHS } from './data.js';

const hash2 = (i, j) => {
  const n = Math.sin(i * 127.1 + j * 311.7 + 13.7) * 43758.5453;
  return n - Math.floor(n);
};
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); norm += amp; f *= 2.03; amp *= 0.5; }
  return s / norm;
}

const bump = (p, x, z) => {
  const dx = x - p.x, dz = z - p.z;
  const t = (dx * dx) / (p.rx * p.rx) + (dz * dz) / (p.rz * p.rz);
  // 幂而不是高斯：高斯的肩太圆，山形成一团面包；t^k 留出较长的坡脚
  return Math.exp(-Math.pow(t, p.sharp || 1.15) * 1.35);
};

const segDist = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az;
  const len = vx * vx + vz * vz || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
};

const ridgeAt = (x, z) => {
  let h = 0;
  for (const r of MOUNT.ridges) {
    let d = 1e9;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1]));
    }
    h += r.h * Math.exp(-Math.pow(d / r.w, 1.7));
  }
  return h;
};

/* ---- 峰高按 alt 反解（Gauss–Seidel 两轮就够，峰距远大于半径时是对角占优的） */
const roughAt = (x, z) => {
  let h = 0;
  for (const p of MOUNT.peaks) h += (p.alt ?? p.h) * bump(p, x, z);
  return h + ridgeAt(x, z);
};
const reliefAt = (x, z) => {
  const bulk = Math.min(1, Math.max(0, (roughAt(x, z) - 8) / 60));
  if (bulk <= 0) return 0;
  return (fbm(x * 0.0055, z * 0.0055, 4) - 0.5) * 15 * bulk
    + (fbm(x * 0.021, z * 0.021, 3) - 0.5) * 5.5 * bulk;
};

const AMP = (() => {
  const peaks = MOUNT.peaks;
  const s = peaks.map((p) => (p.alt ?? p.h) - FOOT_Y);
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i];
      const base = ridgeAt(p.x, p.z) + reliefAt(p.x, p.z);
      let other = 0;
      for (let j = 0; j < peaks.length; j++) if (j !== i) other += s[j] * bump(peaks[j], p.x, p.z);
      const target = (p.alt ?? p.h) - FOOT_Y - base - other; // bump(自身)=1
      s[i] += (target - s[i]) * 0.85;
    }
  }
  return s;
})();

/* ---- 台地：落在设计高程上，收口按到台基矩形的真实米数算 */
const padWeight = (x, z, p) => {
  const ex = Math.abs(x - p.x) - p.rx, ez = Math.abs(z - p.z) - p.rz;
  const out = Math.hypot(Math.max(0, ex), Math.max(0, ez)); // 台基矩形以外的米数
  if (out <= 0) return 1;
  const f = p.feather ?? 60;
  if (out >= f) return 0;
  const k = out / f;
  return 1 - k * k * (3 - 2 * k); // smoothstep 收口，边上不出现折角
};

/** 台基矩形外、feather 区内的最短距离——用来查两块台地的收口区是否互相搭界 */
export const padZoneGap = (a, b) => {
  const dx = Math.max(0, Math.abs(a.x - b.x) - a.rx - b.rx);
  const dz = Math.max(0, Math.abs(a.z - b.z) - a.rz - b.rz);
  return Math.hypot(dx, dz);
};

/** 未经台基削平的自然地面高程 */
export const naturalAt = (x, z) =>
  FOOT_Y + MOUNT.peaks.reduce((a, p, i) => a + AMP[i] * bump(p, x, z), 0) + ridgeAt(x, z) + reliefAt(x, z);

export const peakAlt = (id) => {
  const p = MOUNT.peaks.find((q) => q.id === id);
  return p ? naturalAt(p.x, p.z) : NaN;
};

const PAD_Y = PADS.map((p) => p.y ?? naturalAt(p.x, p.z));
export const padTop = (id) => {
  const i = PADS.findIndex((p) => p.id === id);
  return i < 0 ? NaN : PAD_Y[i];
};

/** 海拔（米，山脚地坪 = FOOT_Y） */
export function heightAt(x, z) {
  let h = naturalAt(x, z);
  // 山脚的开阔地压平，供山门广场起步
  const edge = Math.max(0, 1 - (h - FOOT_Y) / 26);
  h -= (h - FOOT_Y) * edge * 0.72 * Math.max(0, 1 - Math.hypot(x, z) / (EXTENT * 0.42));
  // 台基逐块顺序削平：连续，所以两块台地之间是一段坡而不是一道硬坎。
  // 代价是任何一块的 feather 区不能盖到另一块的中心（relief-check 会查这条）
  for (let i = 0; i < PADS.length; i++) {
    const w = padWeight(x, z, PADS[i]);
    if (w > 0) h = h * (1 - w) + PAD_Y[i] * w;
  }
  return h;
}

export function slopeAt(x, z, d = 4) {
  const hx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
  const hz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
  return Math.hypot(hx, hz);
}

/** 坡向（绕 Y 的转角），石阶、灯杆、殿宇台基顺着它摆才不穿模 */
export function yawAt(x, z, d = 3) {
  const hx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
  const hz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
  return Math.atan2(hx, hz);
}

export const padOf = (id) => PADS.find((p) => p.id === id);

/** 该点落在任一台地收口区里的最大权重：0 是纯自然坡，(0,1) 之间是工程收口的坡道 */
export function padBlend(x, z) {
  let w = 0;
  for (const p of PADS) w = Math.max(w, padWeight(x, z, p));
  return w;
}

/* ------------------------------------------------------------------ 登山道采样 */
/**
 * Catmull–Rom（向心参数化）在 XZ 上采样，再逐点抬到地面。
 * 自己实现而不是用 three 的 Curve，是为了让 node 端的核对脚本与浏览器里的
 * 几何用的是同一串点——否则查出来的纵坡与真正铺出来的道不是一回事。
 */
export function pathSamples(id, perSeg = 26) {
  const spec = PATHS.find((p) => p.id === id);
  if (!spec) return [];
  const P = [[spec.pts[0][0], spec.pts[0][1]], ...spec.pts, [spec.pts.at(-1)[0], spec.pts.at(-1)[1]]];
  const out = [];
  const K = 0.5;
  const lerp = (i, u) => {
    const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
    const d = (a, b) => Math.pow(Math.hypot(a[0] - b[0], a[1] - b[1]), K) || 1e-6;
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const tt = t1 + (t2 - t1) * u;
    const A1 = [(p0[0] + ((p1[0] - p0[0]) / (t1 - t0)) * (tt - t0)), (p0[1] + ((p1[1] - p0[1]) / (t1 - t0)) * (tt - t0))];
    const A2 = [(p1[0] + ((p2[0] - p1[0]) / (t2 - t1)) * (tt - t1)), (p1[1] + ((p2[1] - p1[1]) / (t2 - t1)) * (tt - t1))];
    const A3 = [(p2[0] + ((p3[0] - p2[0]) / (t3 - t2)) * (tt - t2)), (p2[1] + ((p3[1] - p2[1]) / (t3 - t2)) * (tt - t2))];
    const B1 = [A1[0] + ((A2[0] - A1[0]) / (t2 - t0)) * (tt - t0), A1[1] + ((A2[1] - A1[1]) / (t2 - t0)) * (tt - t0)];
    const B2 = [A2[0] + ((A3[0] - A2[0]) / (t3 - t1)) * (tt - t1), A2[1] + ((A3[1] - A2[1]) / (t3 - t1)) * (tt - t1)];
    return [
      B1[0] + ((B2[0] - B1[0]) / (t2 - t1)) * (tt - t1),
      B1[1] + ((B2[1] - B1[1]) / (t2 - t1)) * (tt - t1),
    ];
  };
  for (let i = 0; i < P.length - 3; i++) {
    const n = i === P.length - 4 ? perSeg : perSeg - 1;
    for (let s = 0; s <= n; s++) {
      const [x, z] = lerp(i, s / n);
      out.push({ x, z, y: heightAt(x, z) });
    }
  }
  return out;
}

/** 沿道取位：t∈[0,1]，offset 为横向偏移（右为正），dy 为离地高度 */
export function atPath(id, t, offset = 0, dy = 0) {
  const S = pathSamples(id);
  if (S.length < 2) return null;
  const i = Math.max(0, Math.min(S.length - 1, Math.round(t * (S.length - 1))));
  const j = Math.min(S.length - 1, i + 1), o = Math.max(0, i - 1);
  const tx = S[j].x - S[o].x, tz = S[j].z - S[o].z;
  const tl = Math.hypot(tx, tz) || 1e-6;
  const x = S[i].x + (tz / tl) * offset, z = S[i].z - (tx / tl) * offset;
  return { x, y: heightAt(x, z) + dy, z, yaw: Math.atan2(tx, tz) };
}
