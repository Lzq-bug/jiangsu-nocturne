/**
 * 星签 · 56 张小阿卡纳（4 花色 × 14）
 * 名称沿用传统塔罗体系，由素材源数据生成。
 */
import type { MinorCardData, MinorRank, SuitKey } from '../types';
import { minorNameEn, minorNameZh, SUIT_ZH } from '../types';
import {
  ACE_ORACLE, COURT_NOTES, COURT_ORACLE, SUITS, SUIT_KEYWORDS, SUIT_NOTE_TEMPLATE,
} from './minorSource';

function rankMeaning(suit: SuitKey, rank: MinorRank): string {
  const kw = SUIT_KEYWORDS[suit][rank - 1];
  const zh = SUIT_ZH[suit];
  return rank === 1
    ? `${zh}的开端之力：${kw}。`
    : `${zh}之${rank <= 10 ? '数' : ''}义：${kw}。`;
}

function buildMinor(suit: SuitKey, rank: MinorRank): MinorCardData {
  const meta = SUITS.find((s) => s.key === suit)!;
  const kw = SUIT_KEYWORDS[suit][rank - 1];
  const nameZh = minorNameZh(suit, rank);

  let oracle: string;
  let note: string;
  if (rank === 1) {
    oracle = ACE_ORACLE[suit];
    note = `魔女将这枚${meta.sigil}单独封存——「${kw}」。万物有了第一粒，才有后来的一切。——魔女手记·星签`;
  } else if (rank >= 11) {
    oracle = COURT_ORACLE[suit][rank as 11 | 12 | 13 | 14];
    note = `${COURT_NOTES[suit][rank as 11 | 12 | 13 | 14]}——魔女手记·星签`;
  } else {
    oracle = `星图排到第 ${rank} 位——${kw.split('、')[0]}。`;
    note = SUIT_NOTE_TEMPLATE[suit].replace('{k}', kw) + '';
  }

  return {
    id: `minor-${suit}-${rank}`,
    arcana: 'minor',
    suit,
    rank,
    nameZh,
    nameEn: minorNameEn(suit, rank),
    keywords: kw.split('、'),
    accent: meta.accent,
    meaning: rankMeaning(suit, rank),
    oracle,
    note,
  };
}

export const MINORS: MinorCardData[] = SUITS.flatMap((s) =>
  ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as MinorRank[]).map((r) => buildMinor(s.key, r)),
);
