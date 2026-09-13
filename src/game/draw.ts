/**
 * 启封（抽牌）核心逻辑
 * 规则：先按 月章25/星签75 定级，再在级内按「未拥有加权」抽卡；
 * 收集保护：连续 pityThreshold 次未得新卡后，本次强制从未拥有中抽取。
 * 全部为纯函数，结果先于动画确定。
 */
import { ALL_CARDS, isMajor } from '@/tarot/data';
import type { CardData } from '@/tarot/types';
import { ECONOMY } from './economy';
import type { Rng } from './rng';

export interface DrawInput {
  /** 已拥有卡 id -> 拥有记录 */
  owned: ReadonlySet<string>;
  /** 距上次新卡的抽牌次数（保底计数） */
  sinceLastNew: number;
}

export interface DrawOutcome {
  card: CardData;
  isNew: boolean;
  /** 保底是否在本次触发 */
  pityTriggered: boolean;
}

function weightOf(card: CardData, owned: ReadonlySet<string>): number {
  const base = isMajor(card) ? ECONOMY.weights.major : ECONOMY.weights.minor;
  return owned.has(card.id) ? base : base * ECONOMY.weights.unownedBoost;
}

function weightedPick(rng: Rng, pool: readonly CardData[], owned: ReadonlySet<string>): CardData {
  const weights = pool.map((c) => weightOf(c, owned));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 执行一次启封判定（纯函数；不修改任何状态） */
export function rollDraw(rng: Rng, input: DrawInput): DrawOutcome {
  const { owned, sinceLastNew } = input;
  const unowned = ALL_CARDS.filter((c) => !owned.has(c.id));
  const pity = owned.size > 0 && sinceLastNew + 1 >= ECONOMY.pityThreshold && unowned.length > 0;

  if (pity) {
    return { card: weightedPick(rng, unowned, owned), isNew: true, pityTriggered: true };
  }

  const majors = ALL_CARDS.filter(isMajor);
  const minors = ALL_CARDS.filter((c) => !isMajor(c));
  const pool = rng() * (ECONOMY.weights.major + ECONOMY.weights.minor) < ECONOMY.weights.major
    ? majors
    : minors;
  const card = weightedPick(rng, pool, owned);
  return { card, isNew: !owned.has(card.id), pityTriggered: false };
}
