/**
 * 卡牌渲染组件：城章（MajorCardArt）/ 夜签（MinorCardArt）/ 封缄（SealedCard）
 * 异形轮廓为原创骨架；画窗内为程序化生成的江苏夜景（见 nightScene）。
 */
import type { CSSProperties } from 'react';
import type { CardData, MajorCardData, MinorCardData } from '@/tarot/types';
import { SUIT_ZH } from '@/tarot/types';
import { nightArtFor } from './nightArt';
import { majorOutlinePath, majorPedestalPath, minorOutlinePath } from './cardShapes';

export interface CardArtProps {
  card: CardData;
  /** 未知牌（夜泊阁封缄位）时仍需形状 */
  style?: CSSProperties;
  className?: string;
}

/* ---------------- 城章 ---------------- */

export function MajorCardArt({ card, style, className }: { card: MajorCardData } & Omit<CardArtProps, 'card'>) {
  const uid = `mj-${card.num}`;
  const path = majorOutlinePath(card.shape);
  const art = nightArtFor(card);

  return (
    <svg
      viewBox="0 0 100 232"
      role="img"
      aria-label={`${card.city} ${card.nameZh}（城章 ${card.roman}）`}
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
          {/* 月窗铭号：新月牌匾 + 罗马数字（城章席序） */}
          <g transform="translate(50 40)">
            <path d="M -16 -6 A 16 16 0 1 0 16 -6 A 12 12 0 1 1 -16 -6 Z" fill="rgba(13,18,38,0.85)" stroke="var(--silver)" strokeWidth="1.2" />
            <text y="3.4" textAnchor="middle" fontSize="9" fill="var(--gold)" fontFamily="var(--font-mono)" letterSpacing="0.5">
              {card.roman}
            </text>
          </g>

          {/* 星轨饰带：弧线 + 星点（章节序数，纯装饰性） */}
          <path d="M 22 58 C 34 52, 66 52, 78 58" fill="none" stroke="var(--silver)" strokeWidth="0.7" opacity="0.55" />
          {Array.from({ length: (card.num % 7) + 1 }).map((_, i, arr) => {
            const t = (i + 1) / (arr.length + 1);
            const x = 24 + 52 * t;
            const y = 56.5 - Math.sin(Math.PI * t) * 5;
            return <circle key={i} cx={x} cy={y} r="0.9" fill="var(--cyan)" opacity="0.9" />;
          })}

          {/* 秘仪窗：程序化生成的景点夜景 */}
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
            <rect x="10" y="63" width="80" height="110" fill="none" stroke="var(--silver)" strokeWidth="0.7" opacity="0.55" />
          </g>

          {/* 真名带 */}
          <g>
            <path d="M 14 176 L 86 176" stroke="rgba(199,206,221,0.3)" strokeWidth="0.7" />
            <text x="50" y="190" textAnchor="middle" fontSize="9.8" fill="var(--moonlight)" letterSpacing="0.6" fontFamily="var(--font-serif)" fontWeight="600">
              {card.nameZh}
            </text>
            <text x="50" y="199.5" textAnchor="middle" fontSize="4.6" fill="var(--text-mid)" letterSpacing="1.2" fontFamily="var(--font-mono)">
              {card.city} · {card.oracle.slice(0, 10)}
            </text>
          </g>

          {/* 火漆星印 */}
          <g transform="translate(50 212)">
            <circle r="5.4" fill="#6e2c27" />
            <circle r="5.4" fill="none" stroke="rgba(255,220,200,0.25)" strokeWidth="0.6" />
            <circle r="2" fill={card.accent} opacity="0.85" />
          </g>
        </g>

        {/* 台座增强：台阶缘独立提亮，保证缩略图下「阶梯台座」可读 */}
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

/* ---------------- 夜签 ---------------- */

export function MinorCardArt({ card, style, className }: { card: MinorCardData } & Omit<CardArtProps, 'card'>) {
  const uid = `mn-${card.suit}-${card.rank}`;
  const path = minorOutlinePath(card.suit);
  const art = nightArtFor(card);
  const suitChar = SUIT_ZH[card.suit].slice(0, 1);

  return (
    <svg
      viewBox="0 0 100 160"
      role="img"
      aria-label={`${card.city} ${card.nameZh}（夜签·${SUIT_ZH[card.suit]}）`}
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
        {/* 系列底纹：右上淡色晕 + 系列字角标 */}
        <circle cx="78" cy="30" r="34" fill={card.accent} opacity="0.07" />
        <text x="21" y="60" fontSize="9" fill={card.accent} fontFamily="var(--font-serif)" fontWeight="600">
          {suitChar}
        </text>
        <text x="21" y="68" fontSize="4.2" fill="var(--text-mid)" fontFamily="var(--font-mono)" opacity="0.8">
          {card.rank} / 14
        </text>

        {/* 画窗：程序化生成的景点夜景 */}
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

        {/* 真名带（小牌仅牌名，层级让给城章） */}
        <path d="M 18 126 L 82 126" stroke="rgba(199,206,221,0.28)" strokeWidth="0.6" />
        <text x="50" y="138" textAnchor="middle" fontSize="9" fill="var(--moonlight)" letterSpacing="0.6" fontFamily="var(--font-serif)">
          {card.nameZh}
        </text>

        {/* 简化火漆点 */}
        <circle cx="50" cy="147" r="2.6" fill="#6e2c27" />
        <circle cx="50" cy="147" r="1" fill={card.accent} opacity="0.85" />
      </g>
    </svg>
  );
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
          {arcana === 'major' ? '城' : '夜'}
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
