/** 宵月秘藏 · 卡牌数据类型定义 */

export type Arcana = 'major' | 'minor';

export type SuitKey = 'wands' | 'cups' | 'swords' | 'pentacles';

/** 小牌等级：1=王牌(A) 2-10=数字牌 11=侍从 12=骑士 13=王后 14=国王 */
export type MinorRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/** 大牌轮廓变奏参数（月芒尖碑骨架上的单牌个性，见《宵月秘藏》视觉规范 3.2） */
export interface MajorShapeSpec {
  /** 顶主尖横向偏移（-20 ~ 20），负值向左后掠 */
  tilt: number;
  /** 台阶级数（2 或 3） */
  steps: 2 | 3;
  /** 侧翼样式 */
  wing: 'standard' | 'raised' | 'leaf' | 'ribbon' | 'none' | 'ring';
  /** 顶部形制 */
  top: 'apex' | 'twin' | 'triple' | 'flat' | 'wave' | 'ripple' | 'horn' | 'broken' | 'ray' | 'split';
  /** 侧身特形 */
  side: 'straight' | 'scythe' | 'wave';
  /** 特殊透空/附加 */
  cut?: 'crescent' | 'ringCut' | 'lightHole';
  /** 整牌倒置（倒吊人） */
  inverted?: boolean;
}

interface CardBase {
  id: string;
  arcana: Arcana;
  nameZh: string;
  nameEn: string;
  keywords: string[];
  /** 主光色（牌面叙事光源色） */
  accent: string;
}

export interface MajorCardData extends CardBase {
  arcana: 'major';
  num: number;
  roman: string;
  /** 一句话核心象征 */
  meaning: string;
  /** 神谕句（魔女手记第一层） */
  oracle: string;
  /** 象征解读（第二层） */
  interpretation: string;
  /** 收藏者批注（第三层，含落款） */
  note: string;
  shape: MajorShapeSpec;
}

export interface MinorCardData extends CardBase {
  arcana: 'minor';
  suit: SuitKey;
  rank: MinorRank;
  /** 一句话含义 */
  meaning: string;
  /** 神谕句（短） */
  oracle: string;
  /** 魔女短注（简洁版） */
  note: string;
}

export type CardData = MajorCardData | MinorCardData;

export const ROMAN = [
  '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI',
] as const;

export const SUIT_ZH: Record<SuitKey, string> = {
  wands: '权杖', cups: '圣杯', swords: '宝剑', pentacles: '星币',
};

export const RANK_ZH: Record<MinorRank, string> = {
  1: '王牌', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六',
  7: '七', 8: '八', 9: '九', 10: '十', 11: '侍从', 12: '骑士', 13: '王后', 14: '国王',
};

export const RANK_EN: Record<MinorRank, string> = {
  1: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six',
  7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Page', 12: 'Knight', 13: 'Queen', 14: 'King',
};

export function minorNameZh(suit: SuitKey, rank: MinorRank): string {
  return `${SUIT_ZH[suit]}${RANK_ZH[rank]}`;
}

export function minorNameEn(suit: SuitKey, rank: MinorRank): string {
  const suitEn: Record<SuitKey, string> = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pentacles: 'Pentacles' };
  return `${RANK_EN[rank]} of ${suitEn[suit]}`;
}
