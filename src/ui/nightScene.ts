/**
 * 程序化夜景生成器（《夜泊江苏》视觉核心）
 * 由景点母题（motifs）+ 主光色 + 种子，确定性生成：
 *  - 卡面夜景画（major 200×275 / minor 200×220）
 *  - 全景夜游环幕画幅（2880×720，供 PanoView 圆柱投影）
 * 全部矢量、无外部素材；同一 id 永远生成同一画面（存档/截图稳定）。
 */
import type { MotifKind, SpotArt } from '@/tarot/types';

/* ---------------- 种子随机 ---------------- */

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 十六进制颜色向目标色按比例混合 */
function mix(hex: string, target: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1c, g1, b1] = p(hex); const [r2, g2, b2] = p(target);
  const f = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${f(r1c, r2)}${f(g1, g2)}${f(b1, b2)}`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ---------------- 剪影母题 ----------------

  每个母题绘制在局部坐标 120×90 的盒子里，地面线 y=90；
  由调用方 translate/scale 放置。母题向 lights 推发光点（局部坐标），
  放置时换算为全局坐标后统一绘制光晕与倒影。
------------------------------------------------ */

type Rnd = () => number;
interface Light { x: number; y: number; r: number; warm?: boolean }
interface GlobalLight { x: number; y: number; r: number; warm: boolean }

type MotifFn = (rnd: Rnd, accent: string, lights: Light[]) => string;

const SIL = '#0a0e20';      // 剪影主色
const SIL_FAR = '#111936';  // 远景剪影
const WARM = '#ffd58a';     // 暖窗灯色

/** 上翘檐角的坡屋顶 */
function eave(cx: number, y: number, w: number, hgt: number): string {
  const x0 = cx - w / 2; const x1 = cx + w / 2;
  return `<path d="M ${r1(x0 - w * 0.12)} ${r1(y + 1)} Q ${cx} ${r1(y - hgt)} ${r1(x1 + w * 0.12)} ${r1(y + 1)} L ${r1(x1 - w * 0.1)} ${r1(y + 2.6)} L ${r1(x0 + w * 0.1)} ${r1(y + 2.6)} Z" fill="${SIL}"/>`;
}

const MOTIFS: Record<MotifKind, MotifFn> = {
  pagoda(rnd, _a, lights) {
    const tiers = 4 + Math.floor(rnd() * 3);
    const cx = 60; let y = 90; let w = 62;
    let out = '';
    for (let i = 0; i < tiers; i++) {
      const bh = 13 - i * 1.4;
      out += `<rect x="${r1(cx - w / 2 + 5)}" y="${r1(y - bh)}" width="${r1(w - 10)}" height="${r1(bh)}" fill="${SIL}"/>`;
      out += `<rect x="${r1(cx - 1.1)}" y="${r1(y - bh + 2)}" width="2.2" height="${r1(bh - 4)}" fill="${WARM}" opacity=".78"/>`;
      lights.push({ x: cx, y: y - bh / 2, r: 5 });
      y -= bh + 5.5;
      out += eave(cx, y, w, 9);
      w *= 0.84;
    }
    out += `<rect x="${r1(cx - 0.9)}" y="${r1(y - 9)}" width="1.8" height="9" fill="${SIL}"/><circle cx="${cx}" cy="${r1(y - 11)}" r="2" fill="${SIL}"/>`;
    lights.push({ x: cx, y: y - 11, r: 4.5 });
    return out;
  },

  pavilion(_rnd, _a, lights) {
    let out = `<rect x="26" y="84" width="68" height="6" fill="${SIL}"/>`;
    out += `<rect x="36" y="52" width="4" height="32" fill="${SIL}"/><rect x="80" y="52" width="4" height="32" fill="${SIL}"/><rect x="48" y="56" width="3" height="28" fill="${SIL}"/><rect x="69" y="56" width="3" height="28" fill="${SIL}"/>`;
    out += eave(60, 52, 78, 20);
    out += `<rect x="34" y="34" width="52" height="3.6" fill="${SIL}"/>`;
    out += eave(60, 34, 56, 15);
    out += `<circle cx="60" cy="15.5" r="2.2" fill="${SIL}"/>`;
    lights.push({ x: 60, y: 15.5, r: 5.5 });
    lights.push({ x: 38, y: 56, r: 4, warm: true });
    lights.push({ x: 82, y: 56, r: 4, warm: true });
    return out;
  },

  bridge(_rnd, _a, lights) {
    let out = `<path fill-rule="evenodd" d="M 0 90 L 0 58 Q 60 30 120 58 L 120 90 L 87 90 A 27 27 0 0 1 33 90 Z" fill="${SIL}"/>`;
    out += `<path d="M 2 55 Q 60 28 118 55" fill="none" stroke="${SIL}" stroke-width="2"/>`;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8; const x = 8 + t * 104;
      const y = 57 - 27 * (1 - Math.abs(t - 0.5) * 2) * 0.62;
      out += `<rect x="${r1(x)}" y="${r1(y - 4)}" width="1.4" height="4.4" fill="${SIL}"/>`;
    }
    lights.push({ x: 8, y: 50, r: 4.5, warm: true });
    lights.push({ x: 112, y: 50, r: 4.5, warm: true });
    lights.push({ x: 60, y: 30, r: 5 });
    return out;
  },

  ferry(rnd, _a, lights) {
    const decks = rnd() > 0.45 ? 2 : 1;
    let out = `<path d="M 6 78 Q 60 90 114 78 L 104 66 L 16 66 Z" fill="${SIL}"/>`;
    out += `<rect x="20" y="58" width="80" height="8" fill="${SIL}"/>`;
    for (let i = 0; i < 5; i++) {
      const x = 24 + i * 17;
      out += `<circle cx="${x}" cy="${r1(62)}" r="2.1" fill="${WARM}" opacity=".92"/>`;
      lights.push({ x, y: 62, r: 5, warm: true });
    }
    if (decks === 2) {
      out += `<rect x="30" y="48" width="60" height="10" fill="${SIL}"/>`;
      out += eave(60, 48, 74, 12);
      lights.push({ x: 60, y: 40, r: 5.5 });
      for (let i = 0; i < 3; i++) lights.push({ x: 36 + i * 24, y: 53, r: 4.5, warm: true });
    } else {
      out += eave(60, 58, 88, 13);
      lights.push({ x: 60, y: 49, r: 5 });
    }
    out += `<rect x="57" y="42" width="2" height="8" fill="${SIL}"/><circle cx="58" cy="41" r="1.6" fill="${WARM}"/>`;
    return out;
  },

  street(rnd, _a, lights) {
    let out = ''; let x = 2;
    while (x < 112) {
      const w = 13 + rnd() * 9;
      const h = 14 + rnd() * 12;
      const two = rnd() > 0.6;
      const bh = two ? h * 1.55 : h;
      out += `<rect x="${r1(x)}" y="${r1(90 - bh)}" width="${r1(w)}" height="${r1(bh)}" fill="${SIL}"/>`;
      out += `<path d="M ${r1(x - 2)} ${r1(90 - bh)} L ${r1(x + w / 2)} ${r1(90 - bh - 5 - rnd() * 3)} L ${r1(x + w + 2)} ${r1(90 - bh)} Z" fill="${SIL}"/>`;
      const wins = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < wins; i++) {
        const wx = x + 3 + rnd() * (w - 6);
        const wy = 90 - bh + 3 + rnd() * (bh - 8);
        out += `<rect x="${r1(wx)}" y="${r1(wy)}" width="2.4" height="3.2" fill="${WARM}" opacity=".85"/>`;
        lights.push({ x: wx + 1.2, y: wy + 1.6, r: 4, warm: true });
      }
      x += w + 1 + rnd() * 3;
    }
    out += `<path d="M 0 58 Q 60 70 120 58" fill="none" stroke="${SIL}" stroke-width="1.2"/>`;
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5;
      const lx = t * 120;
      const ly = 58 + 40 * (1 - t) * t * 0.62 + 3.2;
      out += `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="2.3" fill="${WARM}" opacity=".95"/>`;
      lights.push({ x: lx, y: ly, r: 5.5, warm: true });
    }
    return out;
  },

  gate(_rnd, _a, lights) {
    let out = `<path fill-rule="evenodd" d="M 8 90 L 8 52 L 112 52 L 112 90 L 74 90 L 74 62 A 14 14 0 0 0 46 62 L 46 90 Z" fill="${SIL}"/>`;
    for (let i = 0; i < 9; i++) {
      out += `<rect x="${r1(10 + i * 11.5)}" y="47" width="6" height="5" fill="${SIL}"/>`;
      if (i % 2 === 0) lights.push({ x: 13 + i * 11.5, y: 49, r: 4, warm: true });
    }
    out += `<rect x="38" y="30" width="44" height="17" fill="${SIL}"/>`;
    out += eave(60, 30, 56, 12);
    lights.push({ x: 60, y: 24, r: 6 });
    lights.push({ x: 60, y: 78, r: 5, warm: true });
    return out;
  },

  wall(_rnd, _a, lights) {
    let out = `<rect x="0" y="58" width="120" height="32" fill="${SIL}"/>`;
    for (let i = 0; i < 10; i++) out += `<rect x="${r1(i * 12.6)}" y="53" width="7" height="5" fill="${SIL}"/>`;
    out += `<path d="M 0 90 L 14 58 M 120 90 L 106 58" stroke="${SIL}" stroke-width="3" fill="none"/>`;
    for (let i = 0; i < 5; i++) {
      const x = 14 + i * 23;
      out += `<circle cx="${x}" cy="56.5" r="1.6" fill="${WARM}" opacity=".9"/>`;
      lights.push({ x, y: 56.5, r: 4.5, warm: true });
    }
    return out;
  },

  skyscraper(_rnd, accent, lights) {
    let out = `<path fill-rule="evenodd" d="M 38 90 L 38 30 Q 60 8 82 30 L 82 90 L 71 90 L 71 36 Q 60 22 49 36 L 49 90 Z" fill="${SIL}"/>`;
    out += `<rect x="8" y="38" width="20" height="52" fill="${SIL}"/><rect x="92" y="30" width="20" height="60" fill="${SIL}"/>`;
    for (let i = 0; i < 6; i++) {
      const wy = 44 + i * 7.6;
      out += `<rect x="${r1(12 + (i % 2) * 8)}" y="${r1(wy)}" width="3" height="2.2" fill="${WARM}" opacity=".7"/>`;
      if (i % 2 === 0) lights.push({ x: 13.5 + (i % 2) * 8, y: wy + 1, r: 3.6, warm: true });
      out += `<rect x="${r1(96 + (i % 3) * 5.5)}" y="${r1(36 + i * 8)}" width="3" height="2.2" fill="${WARM}" opacity=".65"/>`;
    }
    out += `<rect x="58.8" y="6" width="2.4" height="10" fill="${SIL}"/><circle cx="60" cy="5.5" r="2" fill="${accent}" opacity=".95"/>`;
    lights.push({ x: 60, y: 5.5, r: 5.5 });
    lights.push({ x: 60, y: 16, r: 5 });
    return out;
  },

  lighthouse(_rnd, accent, lights) {
    let out = `<path d="M 52 90 L 55.5 36 L 64.5 36 L 68 90 Z" fill="${SIL}"/>`;
    out += `<rect x="50" y="30" width="20" height="6" fill="${SIL}"/>`;
    out += `<path d="M 52 30 Q 60 18 68 30 Z" fill="${SIL}"/>`;
    out += `<circle cx="60" cy="26" r="2.4" fill="${WARM}"/>`;
    out += `<polygon points="60,26 120,14 120,36" fill="${accent}" opacity=".14"/>`;
    out += `<polygon points="60,26 0,20 0,34" fill="${accent}" opacity=".08"/>`;
    out += `<rect x="0" y="86" width="120" height="4" fill="${SIL}"/>`;
    lights.push({ x: 60, y: 26, r: 8 });
    return out;
  },

  temple(_rnd, _a, lights) {
    let out = `<rect x="22" y="62" width="76" height="28" fill="${SIL}"/>`;
    out += eave(60, 62, 88, 15);
    out += `<rect x="36" y="44" width="48" height="14" fill="${SIL}"/>`;
    out += eave(60, 44, 62, 13);
    out += `<rect x="58" y="26" width="4" height="8" fill="${SIL}"/><circle cx="60" cy="24" r="2.2" fill="${WARM}"/>`;
    lights.push({ x: 60, y: 24, r: 5.5 });
    lights.push({ x: 30, y: 66, r: 4.5, warm: true });
    lights.push({ x: 90, y: 66, r: 4.5, warm: true });
    lights.push({ x: 60, y: 76, r: 5, warm: true });
    return out;
  },

  buddha(_rnd, accent, lights) {
    let out = `<circle cx="60" cy="26" r="17" fill="none" stroke="${accent}" stroke-width="1.6" opacity=".4"/>`;
    out += `<circle cx="60" cy="26" r="9.5" fill="${SIL}"/>`;
    out += `<path d="M 32 90 Q 33 54 48 46 L 72 46 Q 87 54 88 90 Z" fill="${SIL}"/>`;
    out += `<path d="M 26 90 Q 40 78 60 78 Q 80 78 94 90 Z" fill="${SIL}"/>`;
    for (let i = 0; i < 4; i++) {
      const x = 30 + i * 20;
      out += `<circle cx="${x}" cy="${r1(85 - (i % 2) * 3)}" r="1.5" fill="${WARM}" opacity=".8"/>`;
      lights.push({ x, y: 85 - (i % 2) * 3, r: 3.6, warm: true });
    }
    lights.push({ x: 60, y: 26, r: 6 });
    return out;
  },

  hill(rnd, _a, lights) {
    let out = `<path d="M 0 90 L 0 62 Q 22 34 46 58 Q 66 78 86 52 Q 104 32 120 56 L 120 90 Z" fill="${SIL_FAR}"/>`;
    out += `<path d="M 0 90 L 0 74 Q 30 52 58 72 Q 84 88 120 68 L 120 90 Z" fill="${SIL}"/>`;
    const px = 40 + rnd() * 40;
    const py = 74 - 22 * (1 - Math.abs(px - 60) / 60);
    out += `<rect x="${r1(px - 2.6)}" y="${r1(py - 6)}" width="5.2" height="6" fill="${SIL}"/>`;
    out += eave(px, py - 6, 9, 4);
    lights.push({ x: px, y: py - 9, r: 4 });
    for (let i = 0; i < 3; i++) lights.push({ x: 26 + i * 30, y: 80 - i * 2, r: 3.6, warm: true });
    return out;
  },

  lake(rnd, _a, lights) {
    let out = `<path d="M 0 90 L 0 78 Q 20 74 34 77 Q 52 80 68 76 Q 90 71 120 77 L 120 90 Z" fill="${SIL_FAR}"/>`;
    out += `<rect x="54" y="66" width="12" height="12" fill="${SIL}"/>`;
    out += eave(60, 66, 17, 6);
    lights.push({ x: 60, y: 60, r: 4 });
    if (rnd() > 0.4) {
      out += `<path d="M 20 82 Q 30 85 40 82 L 37 79 L 23 79 Z" fill="${SIL}"/><rect x="29" y="73" width="1.4" height="6" fill="${SIL}"/>`;
      lights.push({ x: 30, y: 74, r: 3.5, warm: true });
    }
    return out;
  },

  sea(rnd, _a, lights) {
    let out = `<rect x="0" y="72" width="120" height="18" fill="${SIL}"/>`;
    const sx = 30 + rnd() * 60;
    out += `<path d="M ${r1(sx - 8)} 72 Q ${sx} 76 ${r1(sx + 8)} 72 L ${r1(sx + 6)} 69 L ${r1(sx - 6)} 69 Z" fill="${SIL}"/><rect x="${r1(sx - 0.7)}" y="62" width="1.4" height="7" fill="${SIL}"/>`;
    out += `<circle cx="${r1(sx)}" cy="63" r="1.3" fill="${WARM}"/>`;
    lights.push({ x: sx, y: 63, r: 4, warm: true });
    lights.push({ x: 12, y: 71, r: 3, warm: true });
    lights.push({ x: 104, y: 70.5, r: 3, warm: true });
    return out;
  },

  garden(_rnd, _a, lights) {
    let out = `<path fill-rule="evenodd" d="M 10 90 L 10 50 L 110 50 L 110 90 L 80 90 A 20 20 0 0 0 40 90 Z" fill="${SIL}"/>`;
    out += eave(95, 50, 26, 9);
    out += `<path d="M 16 90 Q 22 74 30 82 Q 36 70 44 84 L 44 90 Z" fill="${SIL}"/>`;
    out += `<path d="M 76 90 Q 82 76 90 84 Q 98 72 106 86 L 106 90 Z" fill="${SIL}"/>`;
    lights.push({ x: 34, y: 62, r: 5, warm: true });
    lights.push({ x: 86, y: 62, r: 5, warm: true });
    return out;
  },

  banner(_rnd, accent, lights) {
    let out = `<rect x="26" y="64" width="68" height="26" fill="${SIL}"/>`;
    out += eave(60, 64, 76, 13);
    out += `<rect x="30" y="14" width="2.2" height="76" fill="${SIL}"/><rect x="88" y="20" width="2.2" height="70" fill="${SIL}"/>`;
    out += `<path d="M 32 18 Q 46 22 58 18 L 58 30 Q 46 34 32 30 Z" fill="${SIL}" stroke="${accent}" stroke-width="1" opacity=".92"/>`;
    out += `<path d="M 90 24 Q 102 28 112 24 L 112 34 Q 102 38 90 34 Z" fill="${SIL}" stroke="${accent}" stroke-width="1" opacity=".92"/>`;
    lights.push({ x: 60, y: 56, r: 5.5 });
    lights.push({ x: 31, y: 40, r: 4, warm: true });
    lights.push({ x: 89, y: 46, r: 4, warm: true });
    return out;
  },
};

/* ---------------- 场景组装 ---------------- */

interface SceneOpts {
  w: number;
  h: number;
  /** 地平线比例（0-1） */
  waterRatio: number;
  accent: string;
  art: SpotArt;
  seed: string;
  /** 全景模式：母题沿宽度平铺、星更密、无晕影 */
  pano?: boolean;
}

function drawScene(o: SceneOpts): string {
  const rnd = mulberry32(hashSeed(o.seed));
  const { w, h, accent } = o;
  const waterY = h * o.waterRatio;
  const scale = h * (o.pano ? 0.0058 : 0.0050);
  const warmGlow = mix(WARM, accent, 0.25);

  let out = '';

  // —— 渐变定义 ——
  out += `<defs>
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${o.pano ? '#070b1c' : '#0b1026'}"/>
      <stop offset="0.62" stop-color="${mix('#1a2450', accent, o.pano ? 0.2 : 0.16)}"/>
      <stop offset="1" stop-color="${mix('#31407a', accent, o.pano ? 0.26 : 0.34)}"/>
    </linearGradient>
    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${mix('#1c2444', accent, o.pano ? 0.18 : 0.3)}"/>
      <stop offset="1" stop-color="#050816"/>
    </linearGradient>
    <radialGradient id="lg"><stop offset="0" stop-color="${warmGlow}" stop-opacity=".85"/><stop offset="1" stop-color="${warmGlow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vg"><stop offset="0.55" stop-color="#04060f" stop-opacity="0"/><stop offset="1" stop-color="#04060f" stop-opacity=".55"/></radialGradient>
  </defs>`;

  // —— 天空 ——
  out += `<rect x="0" y="0" width="${w}" height="${r1(waterY + 2)}" fill="url(#sg)"/>`;

  // —— 星星 ——
  const stars = o.pano ? 110 : 54;
  for (let i = 0; i < stars; i++) {
    const sx = rnd() * w;
    const sy = rnd() * waterY * 0.82;
    const sr = 0.5 + rnd() * 1.1;
    const so = 0.25 + rnd() * 0.65;
    out += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="${r1(sr)}" fill="#dfe6f5" opacity="${r1(so)}"/>`;
  }
  for (let i = 0; i < (o.pano ? 5 : 2); i++) {
    const sx = rnd() * w; const sy = rnd() * waterY * 0.5;
    out += `<path d="M ${r1(sx)} ${r1(sy - 3)} L ${r1(sx)} ${r1(sy + 3)} M ${r1(sx - 3)} ${r1(sy)} L ${r1(sx + 3)} ${r1(sy)}" stroke="#eef3fc" stroke-width="0.7" opacity=".8"/>`;
  }

  // —— 月亮 ——
  const mx = (o.art.moon ?? 0.72) * w;
  const my = h * (o.pano ? 0.17 : 0.15);
  const mr = h * 0.055;
  const full = (o.art.phase ?? 'waxing') === 'full';
  out += `<circle cx="${r1(mx)}" cy="${r1(my)}" r="${r1(mr * 1.9)}" fill="#e9edf8" opacity=".08"/>`;
  out += `<circle cx="${r1(mx)}" cy="${r1(my)}" r="${r1(mr * 1.35)}" fill="#e9edf8" opacity=".1"/>`;
  if (full) {
    out += `<circle cx="${r1(mx)}" cy="${r1(my)}" r="${r1(mr)}" fill="#eef1fa" opacity=".96"/>`;
    out += `<circle cx="${r1(mx - mr * 0.3)}" cy="${r1(my - mr * 0.2)}" r="${r1(mr * 0.18)}" fill="#c9d2e8" opacity=".5"/><circle cx="${r1(mx + mr * 0.25)}" cy="${r1(my + mr * 0.3)}" r="${r1(mr * 0.12)}" fill="#c9d2e8" opacity=".45"/>`;
  } else {
    out += `<path d="M ${r1(mx)} ${r1(my - mr)} A ${r1(mr)} ${r1(mr)} 0 1 0 ${r1(mx)} ${r1(my + mr)} A ${r1(mr * 0.82)} ${r1(mr * 0.82)} 0 1 1 ${r1(mx)} ${r1(my - mr)} Z" fill="#eef1fa" opacity=".95"/>`;
  }

  // —— 远山（开阔水面改为平直远景） ——
  const openWater = o.art.motifs.includes('sea') || o.art.motifs.includes('lake');
  if (!openWater) {
    out += `<path d="M 0 ${r1(waterY)} L 0 ${r1(waterY - h * 0.05)} Q ${r1(w * 0.18)} ${r1(waterY - h * 0.085)} ${r1(w * 0.36)} ${r1(waterY - h * 0.045)} Q ${r1(w * 0.55)} ${r1(waterY - h * 0.012)} ${r1(w * 0.72)} ${r1(waterY - h * 0.06)} Q ${r1(w * 0.88)} ${r1(waterY - h * 0.09)} ${w} ${r1(waterY - h * 0.04)} L ${w} ${r1(waterY)} Z" fill="${SIL_FAR}" opacity=".85"/>`;
  }

  // —— 天际线母题（放置时同步换算灯光为全局坐标） ——
  const globalLights: GlobalLight[] = [];
  const placeMotif = (kind: MotifKind, cx: number, s: number, seedShift: number, dy = 0): void => {
    const local: Light[] = [];
    const r2 = mulberry32(hashSeed(o.seed + kind + String(seedShift)));
    const body = MOTIFS[kind](r2, accent, local);
    const onWater = kind === 'ferry';
    const tx = cx - 60 * s;
    const ty = waterY - 90 * s + (onWater ? 90 * s * 0.14 : 0) + dy;
    out += `<g transform="translate(${r1(tx)} ${r1(ty)}) scale(${r1(s * 100) / 100})">${body}</g>`;
    for (const li of local) {
      globalLights.push({ x: tx + li.x * s, y: ty + li.y * s, r: li.r * s, warm: Boolean(li.warm) });
    }
  };

  if (o.pano) {
    const tileW = 120 * scale;
    const tiles = Math.ceil(w / tileW);
    for (let i = 0; i < tiles; i++) {
      const kind = o.art.motifs[i % o.art.motifs.length];
      const s = scale * (0.92 + ((i * 37) % 17) / 100);
      placeMotif(kind, i * tileW + tileW / 2, s, i, (i % 3) * 2);
    }
  } else {
    const motifs = o.art.motifs;
    placeMotif(motifs[0], w * (motifs[1] ? 0.34 : 0.5), scale * 1.06, 1);
    if (motifs[1]) placeMotif(motifs[1], w * 0.72, scale * 0.82, 2, h * 0.012);
  }

  // —— 水面 ——
  out += `<rect x="0" y="${r1(waterY)}" width="${w}" height="${r1(h - waterY)}" fill="url(#wg)"/>`;

  // —— 月光水路 ——
  if (openWater) {
    out += `<rect x="${r1(mx - mr * 1.6)}" y="${r1(waterY)}" width="${r1(mr * 3.2)}" height="${r1(h - waterY)}" fill="#e9edf8" opacity=".1"/>`;
  }

  // —— 灯光光晕与倒影 ——
  const maxRefl = h - waterY;
  for (const g of globalLights) {
    out += `<circle cx="${r1(g.x)}" cy="${r1(g.y)}" r="${r1(g.r * 2.4)}" fill="url(#lg)" opacity="${o.pano ? '.38' : '.5'}"/>`;
    if (g.y < waterY) {
      const len = Math.min((waterY - g.y) * (o.pano ? 0.4 : 0.55) + 8 * scale, maxRefl * 0.8);
      const rx = g.x + (rnd() - 0.5) * 3;
      out += `<rect x="${r1(rx - 0.8)}" y="${r1(waterY + 1)}" width="1.6" height="${r1(len)}" rx="0.8" fill="${g.warm ? warmGlow : accent}" opacity="${o.pano ? '.2' : '.33'}"/>`;
    }
  }

  // —— 波光 ——
  const shimmer = o.pano ? 70 : 20;
  for (let i = 0; i < shimmer; i++) {
    const sx = rnd() * w;
    const sy = waterY + rnd() * (h - waterY) * 0.92;
    const sw = (5 + rnd() * 18) * (o.pano ? 1.6 : 1);
    out += `<rect x="${r1(sx)}" y="${r1(sy)}" width="${r1(sw)}" height="1.3" rx="0.65" fill="${rnd() > 0.45 ? warmGlow : '#cdd7ef'}" opacity="${r1(0.05 + rnd() * (o.pano ? 0.09 : 0.13))}"/>`;
  }

  // —— 卡面晕影 ——
  if (!o.pano) {
    out += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#vg)"/>`;
  }

  return out;
}

/** 生成完整 SVG 文档文本 */
function svgDoc(w: number, h: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

/** 卡面夜景（major 200×275 / minor 200×220） */
export function nightCardSVG(id: string, accent: string, art: SpotArt, minor: boolean): string {
  const w = 200; const h = minor ? 220 : 275;
  return svgDoc(w, h, drawScene({ w, h, waterRatio: minor ? 0.74 : 0.7, accent, art, seed: id }));
}

/** 全景环幕画幅（2880×720，左右无缝） */
export function nightPanoSVG(id: string, accent: string, art: SpotArt): string {
  const w = 2880; const h = 720;
  return svgDoc(w, h, drawScene({ w, h, waterRatio: 0.68, accent, art, seed: `${id}:pano`, pano: true }));
}

export function svgToURI(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
