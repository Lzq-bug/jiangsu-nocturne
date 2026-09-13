/** 图鉴（收藏）纯逻辑：新增 / 重复计数 / 进度 */
import { ALL_CARDS, DECK_SIZE } from '@/tarot/data';
import type { CardData } from '@/tarot/types';

export interface OwnedEntry {
  /** 获得次数 */
  count: number;
  firstAt: number;
  lastAt: number;
}

export type CollectionMap = Record<string, OwnedEntry>;

export interface CollectionDelta {
  card: CardData;
  isNew: boolean;
  /** 本次是该卡第几次获得 */
  count: number;
  at: number;
}

/** 记录一次获得，返回新的收藏表（不可变） */
export function recordAcquire(
  collection: CollectionMap,
  card: CardData,
  at: number = Date.now(),
): { next: CollectionMap; delta: CollectionDelta } {
  const prev = collection[card.id];
  const isNew = !prev;
  const next: CollectionMap = {
    ...collection,
    [card.id]: {
      count: (prev?.count ?? 0) + 1,
      firstAt: prev?.firstAt ?? at,
      lastAt: at,
    },
  };
  return { next, delta: { card, isNew, count: next[card.id].count, at } };
}

export function ownedCount(collection: CollectionMap): number {
  return Object.keys(collection).length;
}

export function ownedSet(collection: CollectionMap): Set<string> {
  return new Set(Object.keys(collection));
}

/** 收集进度 0-100 */
export function progressPercent(collection: CollectionMap): number {
  return Math.round((ownedCount(collection) / DECK_SIZE) * 100);
}

/** 是否全部集齐 */
export function isComplete(collection: CollectionMap): boolean {
  return ownedCount(collection) >= ALL_CARDS.length;
}
