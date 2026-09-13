/**
 * 月章纹章母题库 · 每张牌的「秘仪窗」主画面（程序化原创图形）
 * 统一语言：旧银线稿 + 单一主光色点彩（该牌叙事光源）。
 * 局部坐标系 0..100 × 0..100，由卡面缩放嵌入。
 */
import type { ReactNode } from 'react';

export type MotifProps = { a: string }; // a = accent 主光色

const S = { stroke: 'var(--silver)', fill: 'none', strokeWidth: 2 } as const;
const F = (a: string) => ({ fill: a, opacity: 0.9 });

function star(x: number, y: number, r: number, fill: string, key?: string): ReactNode {
  return (
    <g key={key}>
      <circle cx={x} cy={y} r={r * 2.6} fill={fill} opacity={0.14} />
      <circle cx={x} cy={y} r={r} fill={fill} />
    </g>
  );
}

/** 八芒星 path */
function eightStar(cx: number, cy: number, r1: number, r2: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const ang = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    pts.push(`${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

export const MOTIFS: Record<number, (p: MotifProps) => ReactNode> = {
  // 0 愚者：断崖与晨星
  0: ({ a }) => (<g>
    <path d="M 12 78 L 46 78 L 46 66 C 52 60, 58 50, 62 34" {...S} />
    <path d="M 88 78 L 62 78 L 62 66" {...S} strokeDasharray="3 3" opacity={0.6} />
    {star(66, 24, 3.4, a)}
    <circle cx="50" cy="84" r="2.6" fill="var(--silver)" />
    <path d="M 46 78 C 40 84, 34 86, 28 84" {...S} opacity={0.5} />
  </g>),
  // I 魔术师：无限环与四器
  1: ({ a }) => (<g>
    <path d="M 50 38 C 42 26, 26 26, 26 38 C 26 50, 42 50, 50 38 C 58 26, 74 26, 74 38 C 74 50, 58 50, 50 38 Z" {...S} />
    {star(50, 22, 3, a)}
    <circle cx="30" cy="66" r="3" fill="none" stroke="var(--silver)" strokeWidth="1.6" />
    <path d="M 44 62 L 44 70 M 40 66 L 48 66" stroke="var(--silver)" strokeWidth="1.6" />
    <path d="M 58 70 L 66 60 M 66 70 L 58 60" stroke="var(--silver)" strokeWidth="1.6" />
    <circle cx="76" cy="66" r="3.4" fill="none" stroke="var(--silver)" strokeWidth="1.6" />
    <circle cx="76" cy="66" r="1.2" {...F(a)} />
  </g>),
  // II 女祭司：双柱与帷幕之缝
  2: ({ a }) => (<g>
    <rect x="24" y="22" width="5" height="58" {...S} />
    <rect x="71" y="22" width="5" height="58" fill="#0b0f20" stroke="var(--silver)" strokeWidth="1.6" />
    <path d="M 50 24 L 50 74" stroke={a} strokeWidth="2.4" opacity={0.85} />
    <path d="M 34 20 C 40 30, 60 30, 66 20" {...S} opacity={0.6} />
    <path d="M 34 82 C 40 74, 60 74, 66 82" {...S} opacity={0.6} />
    <circle cx="50" cy="16" r="4" fill="none" stroke="var(--silver)" strokeWidth="1.6" />
    <circle cx="50" cy="16" r="1.6" {...F(a)} />
  </g>),
  // III 女皇：麦穗与蔷薇
  3: ({ a }) => (<g>
    <path d="M 50 84 L 50 26" {...S} />
    {[84, 72, 60, 48].map((y, i) => (
      <g key={i}>
        <path d={`M 50 ${y} C ${44 - i} ${y - 4}, ${40 - i} ${y - 10}, ${46 - i} ${y - 12}`} {...S} strokeWidth="1.5" />
        <path d={`M 50 ${y} C ${56 + i} ${y - 4}, ${60 + i} ${y - 10}, ${54 + i} ${y - 12}`} {...S} strokeWidth="1.5" />
      </g>
    ))}
    <circle cx="50" cy="20" r="5" fill="none" stroke={a} strokeWidth="1.8" />
    <circle cx="50" cy="20" r="1.8" {...F(a)} />
  </g>),
  // IV 皇帝：空座与疆界
  4: ({ a }) => (<g>
    <path d="M 34 26 L 34 56 L 66 56 L 66 26 M 34 26 L 66 26" {...S} />
    <path d="M 30 56 L 70 56 L 74 76 L 26 76 Z" {...S} />
    <path d="M 26 82 L 74 82" {...S} />
    <path d="M 38 82 L 30 92 M 50 82 L 50 92 M 62 82 L 70 92" stroke={a} strokeWidth="1.4" opacity={0.7} />
    <path d="M 44 34 C 40 28, 34 30, 34 34 C 34 30, 28 28, 24 32" {...S} strokeWidth="1.4" opacity={0.7} />
    <path d="M 56 34 C 60 28, 66 30, 66 34 C 66 30, 72 28, 76 32" {...S} strokeWidth="1.4" opacity={0.7} />
  </g>),
  // V 教皇：三重冠与交叉钥匙
  5: ({ a }) => (<g>
    <path d="M 34 30 C 34 22, 40 18, 50 18 C 60 18, 66 22, 66 30" {...S} />
    <path d="M 30 30 L 70 30" {...S} />
    <path d="M 38 22 C 40 16, 44 13, 50 12 C 56 13, 60 16, 62 22" {...S} strokeWidth="1.4" opacity={0.7} />
    <path d="M 40 44 L 60 64 M 60 44 L 40 64" {...S} strokeWidth="1.8" />
    <circle cx="50" cy="54" r="3.4" fill="none" stroke={a} strokeWidth="1.6" />
    <path d="M 40 44 L 36 40 M 60 44 L 64 40" {...S} strokeWidth="1.4" />
  </g>),
  // VI 恋人：交缠双环
  6: ({ a }) => (<g>
    <circle cx="41" cy="48" r="17" fill="none" stroke="var(--silver)" strokeWidth="2" />
    <circle cx="59" cy="48" r="17" fill="none" stroke={a} strokeWidth="2" />
    <path d="M 50 20 L 50 14 M 46 17 L 54 17" stroke="var(--silver)" strokeWidth="1.6" />
    {star(50, 78, 2.2, a)}
  </g>),
  // VII 战车：星冠之轮
  7: ({ a }) => (<g>
    <circle cx="50" cy="54" r="18" fill="none" stroke="var(--silver)" strokeWidth="2" />
    <circle cx="50" cy="54" r="8" fill="none" stroke={a} strokeWidth="1.6" />
    <path d="M 50 36 L 50 72 M 32 54 L 68 54 M 37 41 L 63 67 M 63 41 L 37 67" stroke="var(--silver)" strokeWidth="1" opacity={0.6} />
    <path d="M 32 24 L 38 18 L 44 24 L 50 16 L 56 24 L 62 18 L 68 24" {...S} />
    {star(50, 16, 2.4, a)}
  </g>),
  // VIII 力量：合掌之弧与狮鬃
  8: ({ a }) => (<g>
    <path d="M 50 26 C 36 34, 28 48, 30 62 C 32 74, 40 80, 50 80 C 60 80, 68 74, 70 62 C 72 48, 64 34, 50 26 Z" fill="none" stroke="var(--silver)" strokeWidth="1.6" />
    {Array.from({ length: 12 }).map((_, i) => {
      const ang = (Math.PI * 2 * i) / 12;
      return <circle key={i} cx={50 + Math.cos(ang) * 30} cy={52 + Math.sin(ang) * 30} r="2" fill="var(--silver)" opacity={0.5} />;
    })}
    <path d="M 50 34 C 44 40, 44 46, 50 50 C 56 46, 56 40, 50 34 Z" {...F(a)} opacity={0.8} />
  </g>),
  // IX 隐士：六芒提灯
  9: ({ a }) => (<g>
    <path d="M 34 24 L 34 78" {...S} />
    <path d="M 58 36 L 58 76 L 46 76 L 46 36 Z" {...S} />
    <path d="M 54 36 L 54 30 L 50 30 L 50 36" {...S} strokeWidth="1.4" />
    {star(52, 56, 3.4, a)}
    <path d="M 30 82 L 70 82" {...S} opacity={0.4} strokeDasharray="2 4" />
  </g>),
  // X 命运之轮：星盘巨轮
  10: ({ a }) => (<g>
    <circle cx="50" cy="50" r="24" fill="none" stroke="var(--silver)" strokeWidth="2" />
    <circle cx="50" cy="50" r="18" fill="none" stroke={a} strokeWidth="1.2" opacity={0.7} />
    <circle cx="50" cy="50" r="6" fill="none" stroke={a} strokeWidth="1.6" />
    {Array.from({ length: 8 }).map((_, i) => {
      const ang = (Math.PI * 2 * i) / 8;
      return <circle key={i} cx={50 + Math.cos(ang) * 24} cy={50 + Math.sin(ang) * 24} r="1.8" fill="var(--silver)" />;
    })}
    {Array.from({ length: 4 }).map((_, i) => {
      const ang = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      return <path key={i} d={`M 50 50 L ${(50 + Math.cos(ang) * 24).toFixed(1)} ${(50 + Math.sin(ang) * 24).toFixed(1)}`} stroke="var(--silver)" strokeWidth="0.8" opacity={0.5} />;
    })}
  </g>),
  // XI 正义：竖剑与天秤
  11: ({ a }) => (<g>
    <path d="M 50 20 L 50 76 M 46 28 L 54 28 M 44 34 L 56 34" {...S} strokeWidth="1.8" />
    <path d="M 30 44 L 30 52 M 70 44 L 70 52" stroke="var(--silver)" strokeWidth="1.4" />
    <path d="M 24 52 C 24 58, 36 58, 36 52" {...S} strokeWidth="1.4" />
    <path d="M 64 52 C 64 58, 76 58, 76 52" {...S} strokeWidth="1.4" />
    <path d="M 30 44 C 42 40, 58 40, 70 44" {...S} strokeWidth="1.4" />
    <circle cx="50" cy="18" r="2.2" {...F(a)} />
  </g>),
  // XII 倒吊人：T 枝与倒影
  12: ({ a }) => (<g>
    <path d="M 24 26 L 76 26 M 50 26 L 50 40" {...S} />
    <path d="M 50 40 L 50 58 C 46 64, 54 68, 50 74" {...S} />
    <path d="M 50 74 L 50 78" stroke={a} strokeWidth="2" />
    <path d="M 36 88 C 42 82, 58 82, 64 88" {...S} opacity={0.45} strokeDasharray="2 3" />
  </g>),
  // XIII 死神：镰刃地平线与黑玫瑰
  13: ({ a }) => (<g>
    <path d="M 16 62 C 34 44, 66 44, 84 62" fill="none" stroke="var(--silver)" strokeWidth="2.2" />
    <path d="M 16 62 L 84 62" stroke={a} strokeWidth="1.2" opacity={0.55} />
    <path d="M 26 74 C 30 68, 38 68, 40 74 C 42 80, 34 84, 30 80 C 26 78, 24 76, 26 74 Z" fill="none" stroke="var(--silver)" strokeWidth="1.4" />
    <circle cx="33" cy="76" r="1.6" fill={a} />
    <path d="M 74 74 C 70 68, 62 68, 60 74 C 58 80, 66 84, 70 80 C 74 78, 76 76, 74 74 Z" fill="none" stroke="var(--silver)" strokeWidth="1.4" opacity={0.7} />
    {star(50, 26, 2.6, a)}
  </g>),
  // XIV 节制：双杯与水弧
  14: ({ a }) => (<g>
    <path d="M 30 30 L 30 42 C 30 48, 38 48, 38 42 L 38 30 Z" {...S} strokeWidth="1.6" />
    <path d="M 62 42 L 62 54 C 62 60, 70 60, 70 54 L 70 42 Z" {...S} strokeWidth="1.6" />
    <path d="M 38 40 C 46 30, 56 52, 62 48" fill="none" stroke={a} strokeWidth="1.8" />
    <circle cx="50" cy="40" r="1.6" {...F(a)} />
  </g>),
  // XV 恶魔：角影与松链
  15: ({ a }) => (<g>
    <path d="M 34 24 C 26 30, 24 42, 28 50" {...S} />
    <path d="M 66 24 C 74 30, 76 42, 72 50" {...S} />
    <path d="M 32 44 C 38 58, 62 58, 68 44 C 62 68, 38 68, 32 44 Z" fill="none" stroke="var(--silver)" strokeWidth="1.4" opacity={0.6} />
    <path d="M 40 78 L 60 78" {...S} strokeDasharray="4 4" />
    <circle cx="50" cy="78" r="2.4" fill="none" stroke={a} strokeWidth="1.4" />
    <circle cx="50" cy="30" r="1.8" {...F(a)} opacity={0.8} />
  </g>),
  // XVI 高塔：断塔与凝雷
  16: ({ a }) => (<g>
    <path d="M 38 84 L 38 34 L 62 34 L 62 84" {...S} />
    <path d="M 38 34 L 44 24 L 56 26 L 62 34" {...S} strokeDasharray="3 3" />
    <path d="M 50 8 L 46 18 L 54 16 L 48 28" fill="none" stroke={a} strokeWidth="2" />
    <rect x="44" y="46" width="5" height="7" fill={a} opacity={0.7} />
    <rect x="54" y="60" width="4" height="6" fill={a} opacity={0.5} />
  </g>),
  // XVII 星星：八芒与水弦
  17: ({ a }) => (
    <g>
      <path d={eightStar(50, 38, 22, 8)} fill="none" stroke={a} strokeWidth="1.6" />
      <circle cx="50" cy="38" r="3" {...F(a)} />
      <path d="M 36 66 C 42 62, 58 70, 64 66" {...S} strokeWidth="1.4" />
      <path d="M 34 74 C 44 70, 56 78, 66 74" {...S} strokeWidth="1.2" opacity={0.6} />
      {star(24, 22, 1.6, 'var(--silver)')}
      {star(78, 26, 1.6, 'var(--silver)')}
    </g>
  ),
  // XVIII 月亮：侧脸之月与双塔
  18: ({ a }) => (<g>
    <circle cx="50" cy="34" r="16" fill="none" stroke="var(--silver)" strokeWidth="2" />
    <path d="M 50 18 A 16 16 0 0 1 50 50 C 44 46, 41 40, 41 34 C 41 28, 44 22, 50 18 Z" {...F(a)} opacity={0.75} />
    <path d="M 22 58 L 22 44 L 28 44 L 28 58" {...S} strokeWidth="1.4" />
    <path d="M 72 58 L 72 44 L 78 44 L 78 58" {...S} strokeWidth="1.4" />
    <path d="M 34 66 C 40 62, 60 62, 66 66 C 60 74, 40 74, 34 66 Z" fill="none" stroke={a} strokeWidth="1.2" opacity={0.6} />
  </g>),
  // XIX 太阳：涟漪日轮
  19: ({ a }) => (<g>
    <circle cx="50" cy="42" r="12" {...F(a)} opacity={0.85} />
    <circle cx="50" cy="42" r="18" fill="none" stroke={a} strokeWidth="1.2" opacity={0.6} />
    <circle cx="50" cy="42" r="25" fill="none" stroke={a} strokeWidth="1" opacity={0.3} />
    <path d="M 30 72 C 38 68, 62 68, 70 72" {...S} strokeWidth="1.4" />
    <path d="M 34 79 C 42 76, 58 76, 66 79" {...S} strokeWidth="1" opacity={0.5} />
  </g>),
  // XX 审判：号角与浮棺
  20: ({ a }) => (<g>
    <path d="M 30 30 L 68 22 L 74 34 L 36 42 Z" {...S} />
    <path d="M 30 30 L 24 34 L 32 40" {...S} strokeWidth="1.4" />
    <path d="M 56 28 L 58 18" stroke={a} strokeWidth="1.4" />
    <path d="M 30 62 L 70 62 M 36 62 L 34 72 M 64 62 L 66 72" {...S} strokeWidth="1.4" />
    <path d="M 26 78 C 40 74, 60 74, 74 78" {...S} strokeWidth="1" opacity={0.5} />
  </g>),
  // XXI 世界：环中之舞
  21: ({ a }) => (<g>
    <ellipse cx="50" cy="50" rx="24" ry="30" fill="none" stroke="var(--silver)" strokeWidth="1.6" strokeDasharray="5 3" />
    {Array.from({ length: 10 }).map((_, i) => {
      const ang = (Math.PI * 2 * i) / 10;
      return <ellipse key={i} cx={50 + Math.cos(ang) * 24} cy={50 + Math.sin(ang) * 30} rx="2.6" ry="4" fill="none" stroke={a} strokeWidth="1" opacity={0.7} />;
    })}
    <circle cx="50" cy="50" r="4" {...F(a)} opacity={0.8} />
  </g>),
};
