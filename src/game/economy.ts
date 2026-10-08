/**
 * 经济与抽牌配置（集中可调，测试覆盖）
 * 资源：星屑（Stardust）——观星台小游戏产出，用于启封夜景卡。
 * 本作不设任何付费；概率由引擎确定性生成，与 UI/LLM 无关。
 */

export const ECONOMY = {
  /** 新玩家初始星屑（可免费启封两次） */
  startingStardust: 60,
  /** 单次启封消耗 */
  unsealCost: 30,
  /** 重复卡补偿星屑 */
  duplicateRefund: 8,
  /** 收集保护：连续 N 次未获得新卡后，下次必出新卡 */
  pityThreshold: 10,
  /** 抽牌权重：城章（大牌）与夜签（小牌） */
  weights: {
    major: 25,
    minor: 75,
    /** 同级内：未拥有卡的相对权重（收集保护，避免后期死重复） */
    unownedBoost: 2,
  },
} as const;

export const STAR_CATCH = {
  /** 一局时长（秒） */
  durationSec: 45,
  /** 同时在场星星上限 */
  maxOnScreen: 8,
  /** 普通星屑星：捕获得分/星屑 */
  starValue: 2,
  /** 金星：捕获得分/星屑 */
  goldValue: 6,
  /** 结算加成：单局捕获达到该数量额外奖励 */
  bonusThreshold: 20,
  bonusStardust: 10,
  /** 星星存活时间（毫秒） */
  starLifeMs: 3200,
  /** 生成间隔（毫秒，基础值；随时间略加速） */
  spawnIntervalMs: 620,
} as const;

export function payoutFor(stars: number, golds: number): number {
  return stars * STAR_CATCH.starValue + golds * STAR_CATCH.goldValue +
    (stars + golds >= STAR_CATCH.bonusThreshold ? STAR_CATCH.bonusStardust : 0);
}
