/**
 * 夜签 · 56 张小牌（四大夜色系列 × 14）
 * 由「夜签景点源数据」（src/spots/minorSpots.ts）组装为完整卡牌数据。
 */
import type { MinorCardData, SuitKey } from '../types';
import { MINOR_SPOTS } from '@/spots/minorSpots';
import {
  CLOSING_NOTE_TEMPLATE, SERIES_NOTE_TEMPLATE, SUITS,
} from './minorSource';

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

function buildMinor(suit: SuitKey, index: number): MinorCardData {
  const spot = MINOR_SPOTS[suit][index];
  const meta = SUITS.find((s) => s.key === suit)!;
  const kw = spot.keywords[0];
  const noteBody = spot.rank >= 11
    ? CLOSING_NOTE_TEMPLATE[suit].replace('{k}', kw)
    : SERIES_NOTE_TEMPLATE[suit].replace('{k}', kw);

  return {
    id: `minor-${suit}-${spot.rank}`,
    arcana: 'minor',
    suit,
    rank: spot.rank,
    nameZh: spot.nameZh,
    nameEn: spot.nameEn,
    city: spot.city,
    keywords: spot.keywords,
    accent: spot.accent ?? meta.accent,
    meaning: spot.meaning,
    oracle: spot.oracle,
    note: `${noteBody}——夜航手记·夜签`,
    art: spot.art,
  };
}

export const MINORS: MinorCardData[] = SUITS.flatMap((s) =>
  RANKS.map((_, i) => buildMinor(s.key, i)),
);
