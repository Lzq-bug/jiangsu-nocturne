/** 78 张牌总集与查询 */
import type { CardData, MajorCardData, MinorCardData, SuitKey } from '../types';
import { MAJORS } from './majors';
import { MINORS } from './minors';

export const ALL_CARDS: CardData[] = [...MAJORS, ...MINORS];

export const CARD_BY_ID: ReadonlyMap<string, CardData> = new Map(ALL_CARDS.map((c) => [c.id, c]));

export function getCardById(id: string): CardData | undefined {
  return CARD_BY_ID.get(id);
}

export function isMajor(c: CardData): c is MajorCardData {
  return c.arcana === 'major';
}

export function isMinor(c: CardData): c is MinorCardData {
  return c.arcana === 'minor';
}

export function cardsBySuit(suit: SuitKey): MinorCardData[] {
  return MINORS.filter((m) => m.suit === suit);
}

export const DECK_SIZE = ALL_CARDS.length;
