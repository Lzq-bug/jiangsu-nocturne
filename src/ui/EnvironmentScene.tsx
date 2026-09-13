/**
 * 环境场景（Layer 2）：魔女会旧观星书房
 *
 * 全部为原创程序化 SVG —— 无任何外部素材、无位图背景。
 * 纯装饰：aria-hidden、pointer-events:none，不进入焦点顺序与无障碍树。
 *
 * 组成（按场景由 CSS 控制显隐 / 透明度，见 styles/environment.css）：
 *   · 拱形高窗 + 窗外月夜 + 窗棂          —— 主厅 / 观星台
 *   · 旧书架（可镜像为右侧柜体）           —— 主厅 / 魔女阁 / 详情
 *   · 黄铜天球仪 / 星盘                   —— 主厅
 *   · 烛台与烛光                          —— 全场景
 *   · 观测平台栏杆                        —— 观星台
 *   · 仪式桌羊皮纸                        —— 启封 / 详情
 *   · 档案标签                            —— 魔女阁
 */
import { memo } from 'react';

export type SceneKey = 'home' | 'observatory' | 'unseal' | 'archive' | 'detail' | 'quiet';

/* ---------------- 书架（确定性程序生成，加载时计算一次） ---------------- */

const SHELF_TOPS = [214, 336, 458, 580, 702];
const BOOK_FILLS = ['#141a33', '#182042', '#10152c', '#1b2246', '#0e1328', '#191c33', '#20264d'];

interface Book { x: number; top: number; w: number; h: number; fill: string; tilt: number }

function buildBooks(): Book[] {
  let s = 20260913;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: Book[] = [];
  for (const top of SHELF_TOPS) {
    let x = -30;
    while (x < 244) {
      const w = 8 + Math.round(rnd() * 17);
      const h = 50 + Math.round(rnd() * 46);
      out.push({
        x, top, w, h,
        fill: BOOK_FILLS[Math.floor(rnd() * BOOK_FILLS.length)],
        tilt: rnd() < 0.07 ? Math.round((rnd() * 8 - 4) * 10) / 10 : 0,
      });
      x += w + 1 + Math.round(rnd() * 3);
    }
  }
  return out;
}

const BOOKS = buildBooks();

function ShelfUnit({ id }: { id: string }) {
  return (
    <g id={id}>
      {/* 柜体背板 */}
      <rect x="-40" y="120" width="358" height="712" fill="url(#env-shelf-grad)" />
      {/* 立柱 */}
      <rect x="-40" y="120" width="20" height="712" fill="#0b1020" />
      <rect x="282" y="120" width="18" height="712" fill="#0b1020" />
      {/* 顶檐 */}
      <rect x="-46" y="106" width="368" height="16" fill="#0d1226" stroke={`rgba(199,206,221,0.08)`} strokeWidth="1" />

      {/* 书籍 */}
      {BOOKS.map((b, i) => (
        <g key={i} transform={b.tilt ? `rotate(${b.tilt} ${b.x} ${b.top})` : undefined}>
          <rect x={b.x} y={b.top - b.h} width={b.w} height={b.h} fill={b.fill} />
          <rect x={b.x} y={b.top - b.h} width={b.w} height="0.7" fill="rgba(199,206,221,0.10)" />
          <rect x={b.x} y={b.top - b.h} width="1" height={b.h} fill="rgba(199,206,221,0.07)" />
          {i % 5 === 0 && (
            <rect x={b.x + 1} y={b.top - b.h + 7} width={Math.max(2, b.w - 2)} height="1.4" fill="rgba(178,140,79,0.22)" />
          )}
        </g>
      ))}

      {/* 层板 */}
      {SHELF_TOPS.map((y) => (
        <rect key={y} x="-40" y={y} width="340" height="9" fill="#0f1428" stroke="rgba(199,206,221,0.085)" strokeWidth="1" />
      ))}
      {/* 底座 */}
      <rect x="-46" y="828" width="368" height="18" fill="#0a0e1e" />
    </g>
  );
}

/* ---------------- 主组件 ---------------- */

function EnvironmentSceneBase({ scene }: { scene: SceneKey }) {
  return (
    <div className={`env-scene env-${scene}`} aria-hidden="true" role="presentation">
      {/* Layer 1：夜空（星点层） */}
      <div className="env-sky" />

      {/* Layer 2：魔女会空间 */}
      <svg
        className="env-room"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="env-win-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2344" />
            <stop offset="0.55" stopColor="#141b36" />
            <stop offset="1" stopColor="#0f1428" />
          </linearGradient>
          <radialGradient id="env-moon-halo">
            <stop offset="0" stopColor="#e9edf5" stopOpacity="0.26" />
            <stop offset="0.42" stopColor="#dde3f0" stopOpacity="0.09" />
            <stop offset="1" stopColor="#dde3f0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="env-shelf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#161c38" stopOpacity="0.9" />
            <stop offset="1" stopColor="#0b1020" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="env-candle-glow">
            <stop offset="0" stopColor="#e6c687" stopOpacity="0.20" />
            <stop offset="0.45" stopColor="#b28c4f" stopOpacity="0.075" />
            <stop offset="1" stopColor="#b28c4f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="env-parchment-grad" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#e8ddc4" stopOpacity="0.10" />
            <stop offset="1" stopColor="#cbbd9d" stopOpacity="0.045" />
          </linearGradient>
          <clipPath id="env-win-clip">
            <path d="M1300 644 L1300 292 A62 62 0 0 1 1424 292 L1424 644 Z" />
          </clipPath>
        </defs>

        {/* ---------- 高窗（右侧：站在窗边看到的星夜） ---------- */}
        <g className="env-g-window">
          {/* 石框 */}
          <path
            d="M1286 652 L1286 286 A76 76 0 0 1 1438 286 L1438 652 Z"
            fill="#0b0f20"
            stroke="rgba(199,206,221,0.13)"
            strokeWidth="3"
          />
          {/* 窗内夜空 */}
          <g clipPath="url(#env-win-clip)">
            <path d="M1300 644 L1300 292 A62 62 0 0 1 1424 292 L1424 644 Z" fill="url(#env-win-sky)" />

            {/* 远处月夜 */}
            <circle cx="1362" cy="368" r="52" fill="url(#env-moon-halo)" />
            <circle cx="1362" cy="368" r="11" fill="#e9edf5" opacity="0.52" />
            <circle cx="1362" cy="368" r="11" fill="none" stroke="rgba(233,237,245,0.20)" strokeWidth="0.7" />

            {/* 窗外星点（低密度） */}
            <g fill="#e9edf5">
              <circle cx="1316" cy="330" r="1.1" opacity="0.5" />
              <circle cx="1332" cy="418" r="0.9" opacity="0.4" />
              <circle cx="1352" cy="308" r="1" opacity="0.45" />
              <circle cx="1402" cy="342" r="1" opacity="0.4" />
              <circle cx="1412" cy="452" r="1.1" opacity="0.42" />
              <circle cx="1312" cy="492" r="0.9" opacity="0.34" />
              <circle cx="1386" cy="540" r="1" opacity="0.36" />
              <circle cx="1338" cy="580" r="0.9" opacity="0.3" />
            </g>

            {/* 薄云（40–60s 缓慢横移） */}
            <g className="env-cloud" fill="#2a3358">
              <ellipse cx="1362" cy="452" rx="74" ry="8" opacity="0.20" />
              <ellipse cx="1386" cy="500" rx="56" ry="6" opacity="0.15" />
              <ellipse cx="1330" cy="404" rx="48" ry="5" opacity="0.13" />
            </g>

            {/* 窗棂 */}
            <g stroke="rgba(199,206,221,0.15)" strokeWidth="2.6" fill="none">
              <path d="M1362 282 L1362 644" />
              <path d="M1300 396 L1424 396" />
              <path d="M1300 500 L1424 500" />
            </g>
          </g>

          {/* 窗台 */}
          <rect x="1272" y="646" width="160" height="13" rx="3" fill="#0e1327" stroke="rgba(199,206,221,0.11)" strokeWidth="1.4" />
          <rect x="1272" y="646" width="160" height="2" fill="rgba(230,198,135,0.10)" />
        </g>

        {/* ---------- 旧书架（左侧） ---------- */}
        <g className="env-g-shelf">
          <ShelfUnit id="env-shelf-unit" />
        </g>

        {/* ---------- 右侧柜体（魔女阁：档案室） ---------- */}
        <g className="env-g-shelf-r">
          <use href="#env-shelf-unit" transform="translate(1520 0) scale(-1 1)" />
        </g>

        {/* ---------- 档案标签（魔女阁） ---------- */}
        <g className="env-g-labels" fill="rgba(232,221,196,0.13)">          {SHELF_TOPS.map((y, i) => (
            <g key={y}>
              <rect x="40" y={y - 6} width="22" height="6" rx="1" />
              <rect x="196" y={y - 6} width="14" height="6" rx="1" />
              <rect x="1296" y={y - 6} width="18" height="6" rx="1" />
              <rect x="1400" y={y - 6} width={i % 2 ? 10 : 16} height="6" rx="1" />
            </g>
          ))}
        </g>

        {/* ---------- 黄铜天球仪（右下，桌面上） ---------- */}
        <g className="env-g-astro" transform="translate(1300 762)">
          <ellipse cx="0" cy="94" rx="92" ry="13" fill="rgba(0,0,0,0.32)" />
          <circle r="70" fill="rgba(13,18,38,0.42)" />
          <g className="env-astro-ring">
            <circle r="70" fill="none" stroke="rgba(178,140,79,0.20)" strokeWidth="1.8" />
            <circle r="56" fill="none" stroke="rgba(178,140,79,0.13)" strokeWidth="1" />
            <circle r="38" fill="none" stroke="rgba(178,140,79,0.11)" strokeWidth="1" />
            <ellipse rx="70" ry="23" fill="none" stroke="rgba(178,140,79,0.12)" strokeWidth="1" />
            <ellipse rx="23" ry="70" fill="none" stroke="rgba(178,140,79,0.09)" strokeWidth="1" />
            <path d="M -70 0 L 70 0" stroke="rgba(178,140,79,0.09)" strokeWidth="1" />
            <circle r="4" fill="rgba(178,140,79,0.22)" />
          </g>
          <path d="M -46 86 L 0 58 L 46 86" fill="none" stroke="rgba(178,140,79,0.17)" strokeWidth="3" />
          <rect x="-54" y="86" width="108" height="9" rx="3" fill="rgba(178,140,79,0.15)" />
        </g>

        {/* ---------- 观测平台栏杆（观星台） ---------- */}
        <g className="env-g-rail">
          <rect x="-20" y="742" width="1480" height="10" fill="#0c1122" stroke="rgba(199,206,221,0.10)" strokeWidth="1" />
          <g fill="rgba(199,206,221,0.07)">
            {Array.from({ length: 30 }, (_, i) => (
              <rect key={i} x={-10 + i * 50} y="752" width="5" height="42" />
            ))}
          </g>
          <rect x="-20" y="790" width="1480" height="130" fill="#0a0e1e" />
          <rect x="-20" y="790" width="1480" height="2" fill="rgba(230,198,135,0.07)" />
        </g>

        {/* ---------- 仪式桌：羊皮纸 + 封缄（启封 / 详情） ---------- */}
        <g className="env-g-parchment" transform="translate(720 812)">
          <g transform="rotate(-3)">
            <rect x="-120" y="-34" width="240" height="70" rx="3" fill="url(#env-parchment-grad)" stroke="rgba(232,221,196,0.10)" strokeWidth="1" />
            <g stroke="rgba(232,221,196,0.07)" strokeWidth="1">
              <path d="M -96 -18 L 92 -18" />
              <path d="M -96 -6 L 96 -6" />
              <path d="M -96 6 L 60 6" />
              <path d="M -96 18 L 84 18" />
            </g>
          </g>
          <g transform="translate(78 6)">
            <circle r="11" fill="rgba(140,59,52,0.32)" />
            <circle r="11" fill="none" stroke="rgba(255,220,200,0.12)" strokeWidth="0.8" />
          </g>
        </g>

        {/* ---------- 烛台 ---------- */}
        <g className="env-g-candle" transform="translate(146 806)">
          <ellipse className="env-flame-glow" cx="0" cy="-26" rx="132" ry="104" fill="url(#env-candle-glow)" />
          {/* 烛台底盘 */}
          <path d="M -18 36 L 18 36 L 12 27 L -12 27 Z" fill="rgba(178,140,79,0.22)" />
          <rect x="-22" y="34" width="44" height="6" rx="3" fill="rgba(178,140,79,0.18)" />
          {/* 蜡身 */}
          <rect x="-7" y="-26" width="14" height="54" rx="3" fill="rgba(232,221,196,0.16)" />
          <rect x="-7" y="-26" width="3" height="54" fill="rgba(255,255,255,0.05)" />
          {/* 烛火 */}
          <path className="env-flame" d="M 0 -52 C 6.5 -43, 7.5 -34, 0 -28 C -7.5 -34, -6.5 -43, 0 -52 Z" fill="#e6c687" />
        </g>
      </svg>

      {/* Layer 2（移动端简化版）：只保留夜色 + 1 个高窗暗影 + 少量烛光 / 黄铜纹 */}
      <svg
        className="env-room-m"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="env-mwin-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2344" />
            <stop offset="1" stopColor="#101632" />
          </linearGradient>
          <radialGradient id="env-m-moon-halo">
            <stop offset="0" stopColor="#e9edf5" stopOpacity="0.24" />
            <stop offset="1" stopColor="#dde3f0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="env-m-candle-glow">
            <stop offset="0" stopColor="#e6c687" stopOpacity="0.18" />
            <stop offset="1" stopColor="#b28c4f" stopOpacity="0" />
          </radialGradient>
          <clipPath id="env-mwin-clip">
            <path d="M244 452 L244 168 A82 82 0 0 1 408 168 L408 452 Z" />
          </clipPath>
        </defs>

        {/* 高窗暗影（右上，被画面裁去一半——站在窗边） */}
        <path
          d="M228 462 L228 160 A100 100 0 0 1 424 160 L424 462 Z"
          fill="#0b0f20"
          stroke="rgba(199,206,221,0.11)"
          strokeWidth="3"
        />
        <g clipPath="url(#env-mwin-clip)">
          <path d="M244 452 L244 168 A82 82 0 0 1 408 168 L408 452 Z" fill="url(#env-mwin-sky)" />
          <circle cx="330" cy="236" r="66" fill="url(#env-m-moon-halo)" />
          <circle cx="330" cy="236" r="15" fill="#e9edf5" opacity="0.42" />
          <g fill="#e9edf5">
            <circle cx="268" cy="204" r="1.4" opacity="0.42" />
            <circle cx="292" cy="300" r="1.2" opacity="0.34" />
            <circle cx="372" cy="256" r="1.3" opacity="0.36" />
            <circle cx="392" cy="352" r="1.2" opacity="0.3" />
            <circle cx="266" cy="392" r="1.1" opacity="0.26" />
          </g>
          <g stroke="rgba(199,206,221,0.13)" strokeWidth="2.6" fill="none">
            <path d="M326 158 L326 452" />
            <path d="M244 288 L408 288" />
            <path d="M244 378 L408 378" />
          </g>
        </g>
        <rect x="214" y="456" width="220" height="12" rx="3" fill="#0e1327" stroke="rgba(199,206,221,0.10)" strokeWidth="1.4" />

        {/* 旧书架一角（左，极低对比） */}
        <g opacity="0.55">
          <rect x="-40" y="470" width="150" height="420" fill="#0d1226" />
          <rect x="-40" y="560" width="150" height="9" fill="#111832" stroke="rgba(199,206,221,0.07)" strokeWidth="1" />
          <rect x="-40" y="680" width="150" height="9" fill="#111832" stroke="rgba(199,206,221,0.07)" strokeWidth="1" />
          <g fill="#182042">
            <rect x="-24" y="500" width="12" height="60" />
            <rect x="-10" y="492" width="16" height="68" />
            <rect x="8" y="506" width="10" height="54" />
            <rect x="20" y="498" width="15" height="62" />
            <rect x="-24" y="620" width="14" height="60" />
            <rect x="-8" y="628" width="11" height="52" />
            <rect x="6" y="614" width="17" height="66" />
          </g>
        </g>

        {/* 黄铜纹（右下弧） */}
        <g opacity="0.6">
          <circle cx="386" cy="772" r="118" fill="none" stroke="rgba(178,140,79,0.13)" strokeWidth="1.6" />
          <circle cx="386" cy="772" r="92" fill="none" stroke="rgba(178,140,79,0.09)" strokeWidth="1" />
        </g>

        {/* 烛光（左下） */}
        <g transform="translate(58 742)">
          <ellipse cx="0" cy="-16" rx="104" ry="86" fill="url(#env-m-candle-glow)" />
          <rect x="-6" y="-16" width="12" height="42" rx="3" fill="rgba(232,221,196,0.15)" />
          <path d="M 0 -38 C 5.5 -31, 6 -23, 0 -18 C -6 -23, -5.5 -31, 0 -38 Z" fill="#e6c687" opacity="0.9" />
          <path d="M -16 30 L 16 30 L 10 22 L -10 22 Z" fill="rgba(178,140,79,0.2)" />
        </g>
      </svg>

      {/* 室内体积：两侧墙影 + 顶部梁影（中央留亮给 UI） */}
      <div className="env-room-tint" />

      {/* 近景：旧木桌边缘 */}
      <div className="env-desk" />
    </div>
  );
}

export const EnvironmentScene = memo(EnvironmentSceneBase);
