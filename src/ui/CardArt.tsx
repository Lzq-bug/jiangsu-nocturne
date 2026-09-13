/**
 * 卡牌渲染组件：月章（MajorCardArt）/ 星签（MinorCardArt）/ 封缄（SealedCard）
 * 全部程序化 SVG——《宵月秘藏》原创视觉，无任何外部素材。
 */
import type { CSSProperties } from 'react';
import type { CardData, MajorCardData, MinorCardData } from '@/tarot/types';
import { artworkFor } from '@/tarot/artwork';
import { MOTIFS } from './motifs';
import { majorOutlinePath, majorPedestalPath, minorOutlinePath, pentacleRingPath, worldRingPath } from './cardShapes';

export interface CardArtProps {
  card: CardData;
  /** 未知牌（魔女阁封缄位）时仍需形状 */
  style?: CSSProperties;
  className?: string;
}

/* ---------------- 月章 ---------------- */

export function MajorCardArt({ card, style, className }: { card: MajorCardData } & Omit<CardArtProps, 'card'>) {
  const uid = `mj-${card.num}`;
  const path = majorOutlinePath(card.shape);
  const art = artworkFor(card.id);
  const Motif = MOTIFS[card.num] ?? MOTIFS[0];

  return (
    <svg
      viewBox="0 0 100 232"
      role="img"
      aria-label={`${card.nameZh}（月章 ${card.roman}）`}
      style={style}
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#1d2650" />
          <stop offset="0.55" stopColor="#141a38" />
          <stop offset="1" stopColor="#0d1226" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.42" r="0.5">
          <stop offset="0" stopColor={card.accent} stopOpacity="0.16" />
          <stop offset="1" stopColor={card.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={path} transform={card.shape.inverted ? 'rotate(180 50 116)' : undefined} />
        </clipPath>
      </defs>

      <g transform={card.shape.inverted ? 'rotate(180 50 116)' : undefined}>
        {/* 牌身 */}
        <path d={path} fill={`url(#${uid}-bg)`} stroke="var(--silver)" strokeWidth="1.6" />
        <path d={path} fill={`url(#${uid}-glow)`} />

        <g clipPath={`url(#${uid}-clip)`}>
          {/* 世界的腰间环带 */}
          {card.num === 21 && (
            <path d={worldRingPath()} fill="none" stroke="var(--silver)" strokeWidth="1" opacity="0.5" strokeDasharray="4 3" />
          )}

          {/* 月窗铭号：新月牌匾 + 罗马数字 */}
          <g transform="translate(50 40)">
            <path d="M -16 -6 A 16 16 0 1 0 16 -6 A 12 12 0 1 1 -16 -6 Z" fill="rgba(13,18,38,0.85)" stroke="var(--silver)" strokeWidth="1.2" />
            <text y="3.4" textAnchor="middle" fontSize="9" fill="var(--gold)" fontFamily="var(--font-mono)" letterSpacing="0.5">
              {card.roman}
            </text>
          </g>

          {/* 星轨饰带：弧线 + 星点（数 = 愚者之旅中的叙事章序，纯装饰性） */}
          <path d="M 22 58 C 34 52, 66 52, 78 58" fill="none" stroke="var(--silver)" strokeWidth="0.7" opacity="0.55" />
          {Array.from({ length: (card.num % 7) + 1 }).map((_, i, arr) => {
            const t = (i + 1) / (arr.length + 1);
            const x = 24 + 52 * t;
            const y = 56.5 - Math.sin(Math.PI * t) * 5;
            return <circle key={i} cx={x} cy={y} r="0.9" fill="var(--cyan)" opacity="0.9" />;
          })}

          {/* 秘仪窗：正式插画优先，程序化纹章兜底 */}
          {art ? (
            <g>
              <rect x="10" y="63" width="80" height="110" fill="#0c1126" />
              <image
                href={art}
                x="10"
                y="63"
                width="80"
                height="110"
                preserveAspectRatio="xMidYMid slice"
              />
              {/* 画窗银线内框（版画“图版”感，与牌框分离） */}
              <rect x="10" y="63" width="80" height="110" fill="none" stroke="var(--silver)" strokeWidth="0.7" opacity="0.55" />
            </g>
          ) : (
            <g transform="translate(18 74) scale(0.64)">
              <Motif a={card.accent} />
            </g>
          )}

          {/* 真名带 */}
          <g>
            <path d="M 14 176 L 86 176" stroke="rgba(199,206,221,0.3)" strokeWidth="0.7" />
            <text x="50" y="190" textAnchor="middle" fontSize="12.5" fill="var(--moonlight)" letterSpacing="3" fontFamily="var(--font-serif)" fontWeight="600">
              {card.nameZh}
            </text>
            <text x="50" y="199.5" textAnchor="middle" fontSize="4.6" fill="var(--text-mid)" letterSpacing="1.2" fontFamily="var(--font-mono)">
              {card.oracle.slice(0, 12)}
            </text>
          </g>

          {/* 火漆星印 */}
          <g transform="translate(50 212)">
            <circle r="5.4" fill="#6e2c27" />
            <circle r="5.4" fill="none" stroke="rgba(255,220,200,0.25)" strokeWidth="0.6" />
            <circle r="2" fill={card.accent} opacity="0.85" />
          </g>
        </g>

        {/* 台座增强（Polish 1）：台阶缘独立提亮，保证 96px 缩略图下「阶梯台座」可读 */}
        <path
          d={majorPedestalPath(card.shape.steps)}
          fill="rgba(199,206,221,0.10)"
          stroke="rgba(233,237,245,0.9)"
          strokeWidth="0.9"
        />
      </g>
    </svg>
  );
}

/* ---------------- 星签 ---------------- */

/** 数字牌星阵布局（星座连线 pip） */
function pipLayout(rank: number): Array<[number, number]> {
  switch (rank) {
    case 1: return [[0.5, 0.5]];
    case 2: return [[0.5, 0.28], [0.5, 0.72]];
    case 3: return [[0.5, 0.2], [0.26, 0.72], [0.74, 0.72]];
    case 4: return [[0.28, 0.24], [0.72, 0.24], [0.28, 0.68], [0.72, 0.68]];
    case 5: return [[0.26, 0.2], [0.74, 0.2], [0.5, 0.48], [0.26, 0.76], [0.74, 0.76]];
    case 6: return [[0.3, 0.18], [0.7, 0.18], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]];
    case 7: return [[0.5, 0.14], [0.32, 0.42], [0.68, 0.42], [0.22, 0.74], [0.5, 0.74], [0.78, 0.74], [0.5, 0.94]];
    case 8: return [[0.3, 0.14], [0.7, 0.14], [0.3, 0.38], [0.7, 0.38], [0.3, 0.62], [0.7, 0.62], [0.3, 0.86], [0.7, 0.86]];
    case 9: return [[0.24, 0.16], [0.5, 0.16], [0.76, 0.16], [0.24, 0.5], [0.5, 0.5], [0.76, 0.5], [0.24, 0.84], [0.5, 0.84], [0.76, 0.84]];
    case 10: return [[0.26, 0.12], [0.5, 0.12], [0.74, 0.12], [0.26, 0.37], [0.5, 0.37], [0.74, 0.37], [0.26, 0.63], [0.5, 0.63], [0.74, 0.63], [0.5, 0.88]];
    default: return [[0.5, 0.5]];
  }
}

/** 宫廷徽记：侍从旗 / 骑士羽 / 王后冠弧 / 国王城垛冠 */
function courtEmblem(rank: 11 | 12 | 13 | 14, accent: string) {
  switch (rank) {
    case 11: return (
      <g>
        <path d="M 40 30 L 40 70 L 66 58 L 40 46" fill="none" stroke="var(--silver)" strokeWidth="1.8" />
        <path d="M 44 34 L 62 57" stroke={accent} strokeWidth="1.2" opacity="0.7" />
      </g>
    );
    case 12: return (
      <g>
        <path d="M 50 70 C 38 66, 34 54, 38 42 C 44 50, 48 46, 46 34 C 54 42, 58 38, 56 26 C 66 38, 66 58, 50 70 Z" fill="none" stroke="var(--silver)" strokeWidth="1.6" />
        <circle cx="54" cy="40" r="2.4" fill={accent} opacity="0.85" />
      </g>
    );
    case 13: return (
      <g>
        <path d="M 30 58 C 30 40, 70 40, 70 58" fill="none" stroke="var(--silver)" strokeWidth="1.8" />
        <path d="M 34 52 C 38 44, 62 44, 66 52" fill="none" stroke={accent} strokeWidth="1.2" />
        {[36, 50, 64].map((x, i) => <circle key={i} cx={x} cy="42" r={i === 1 ? 2.6 : 2} fill="none" stroke="var(--silver)" strokeWidth="1.2" />)}
      </g>
    );
    case 14: return (
      <g>
        <path d="M 30 62 L 30 46 L 38 54 L 46 40 L 54 52 L 62 40 L 70 46 L 70 62 Z" fill="none" stroke="var(--silver)" strokeWidth="1.8" />
        <path d="M 34 66 C 40 63, 60 63, 66 66" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
        <circle cx="50" cy="52" r="2.4" fill={accent} opacity="0.9" />
      </g>
    );
  }
}

export function MinorCardArt({ card, style, className }: { card: MinorCardData } & Omit<CardArtProps, 'card'>) {
  const uid = `mn-${card.suit}-${card.rank}`;
  const path = minorOutlinePath(card.suit);
  const art = artworkFor(card.id);

  return (
    <svg
      viewBox="0 0 100 160"
      role="img"
      aria-label={`${card.nameZh}（星签）`}
      style={style}
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#161f38" />
          <stop offset="1" stopColor="#0e1428" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={path} />
        </clipPath>
      </defs>

      <path d={path} fill={`url(#${uid}-bg)`} stroke="var(--silver)" strokeWidth="1.3" />

      <g clipPath={`url(#${uid}-clip)`}>
        {/* 花色底纹：右上淡色晕 */}
        <circle cx="78" cy="30" r="34" fill={card.accent} opacity="0.07" />
        {card.suit === 'pentacles' && !art && <path d={pentacleRingPath()} fill="none" stroke="var(--silver)" strokeWidth="0.7" opacity="0.4" />}

        {/* 角标编号（宫廷为单字） */}
        <text x="21" y="60" fontSize="8" fill={card.accent} fontFamily="var(--font-serif)" fontWeight="600">
          {card.rank === 1 ? 'A' : card.rank <= 10 ? zhNum(card.rank) : ['侍', '骑', '后', '王'][card.rank - 11]}
        </text>

        {/* 中央：正式插画优先；否则数字牌星阵 / 王牌花色符 / 宫廷徽记 */}
        {art ? (
          <g>
            <rect x="12" y="38" width="76" height="84" fill="#0c1126" />
            <image
              href={art}
              x="12"
              y="38"
              width="76"
              height="84"
              preserveAspectRatio="xMidYMid slice"
            />
            <rect x="12" y="38" width="76" height="84" fill="none" stroke="var(--silver)" strokeWidth="0.6" opacity="0.5" />
          </g>
        ) : (
          <>
            {card.rank === 1 && (
              <g transform="translate(50 82)">
                <path d={suitSigil(card.suit)} fill="none" stroke={card.accent} strokeWidth="2" transform="scale(1.9)" />
              </g>
            )}
            {card.rank >= 2 && card.rank <= 10 && (
              <g transform="translate(28 60) scale(0.44)">
                {(() => {
                  const pts = pipLayout(card.rank);
                  const links: Array<[number, number]> = [];
                  for (let i = 0; i < pts.length - 1; i++) links.push([i, i + 1]);
                  if (card.rank === 3 || card.rank === 5 || card.rank === 7) links.push([1, 2]);
                  return (
                    <>
                      {links.map(([a, b], i) => (
                        <line key={i} x1={pts[a][0] * 100} y1={pts[a][1] * 88} x2={pts[b][0] * 100} y2={pts[b][1] * 88} stroke="var(--silver)" strokeWidth="1.4" opacity="0.5" />
                      ))}
                      {pts.map(([x, y], i) => (
                        <g key={i}>
                          <circle cx={x * 100} cy={y * 88} r="7.5" fill={card.accent} opacity="0.16" />
                          <circle cx={x * 100} cy={y * 88} r="3.1" fill={card.accent} />
                        </g>
                      ))}
                    </>
                  );
                })()}
              </g>
            )}
            {card.rank >= 11 && (
              <g transform="translate(0 14) scale(1)">
                {courtEmblem(card.rank as 11 | 12 | 13 | 14, card.accent)}
              </g>
            )}
          </>
        )}

        {/* 真名带（小牌仅牌名，层级让给月章） */}
        <path d="M 18 126 L 82 126" stroke="rgba(199,206,221,0.28)" strokeWidth="0.6" />
        <text x="50" y="138" textAnchor="middle" fontSize="9.5" fill="var(--moonlight)" letterSpacing="2" fontFamily="var(--font-serif)">
          {card.nameZh}
        </text>

        {/* 简化火漆点 */}
        <circle cx="50" cy="147" r="2.6" fill="#6e2c27" />
        <circle cx="50" cy="147" r="1" fill={card.accent} opacity="0.85" />
      </g>
    </svg>
  );
}

function zhNum(n: number): string {
  return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n] ?? String(n);
}

/** 花色符记（王牌放大用） */
function suitSigil(suit: MinorCardData['suit']): string {
  switch (suit) {
    case 'wands': return 'M 0 -12 C 2 -8, 3 -4, 0 0 C -3 -4, -2 -8, 0 -12 M 0 0 L 0 14'; // 杖+焰
    case 'cups': return 'M -8 -8 L 8 -8 C 8 2, 4 6, 0 6 C -4 6, -8 2, -8 -8 M -3 8 L 3 8 M -5 12 L 5 12'; // 爵
    case 'swords': return 'M 0 -14 L 0 8 M -4 -4 L 4 -4 M -3 12 L 3 12'; // 剑
    case 'pentacles': return 'M 0 -10 A 10 10 0 1 1 -0.01 -10 M 0 -5 A 5 5 0 1 0 0.01 -5'; // 双环璧
  }
}

/* ---------------- 封缄（未获得） ---------------- */

export function SealedCard({ arcana, suit, style, className }: {
  arcana: 'major' | 'minor';
  suit?: MinorCardData['suit'];
  style?: CSSProperties;
  className?: string;
}) {
  const path = arcana === 'major'
    ? majorOutlinePath({ tilt: 0, steps: 3, wing: 'standard', top: 'apex', side: 'straight' })
    : minorOutlinePath(suit ?? 'wands');
  const box = arcana === 'major' ? '0 0 100 232' : '0 0 100 160';

  return (
    <svg viewBox={box} role="img" aria-label="封缄的牌位" style={style} className={className}>
      <path d={path} fill="#0c101f" stroke="rgba(140,59,52,0.55)" strokeWidth="1.4" strokeDasharray="4 3" />
      {/* 中央火漆 */}
      <g transform={arcana === 'major' ? 'translate(50 108)' : 'translate(50 72)'}>
        <circle r="13" fill="#5c2622" />
        <circle r="13" fill="none" stroke="rgba(255,220,200,0.2)" strokeWidth="0.8" />
        <circle r="10.5" fill="none" stroke="rgba(255,220,200,0.14)" strokeWidth="0.6" />
        <text y="4.5" textAnchor="middle" fontSize="11" fill="rgba(240,210,190,0.8)" fontFamily="var(--font-serif)">
          {arcana === 'major' ? '月' : '星'}
        </text>
      </g>
      <text
        x="50" y={arcana === 'major' ? 178 : 132}
        textAnchor="middle" fontSize="7" fill="rgba(169,156,201,0.55)" letterSpacing="2.5" fontFamily="var(--font-serif)"
      >
        尚未启封
      </text>
    </svg>
  );
}

/* ---------------- 统一入口 ---------------- */

export function CardArt({ card, ...rest }: CardArtProps) {
  return card.arcana === 'major'
    ? <MajorCardArt card={card} {...rest} />
    : <MinorCardArt card={card} {...rest} />;
}
