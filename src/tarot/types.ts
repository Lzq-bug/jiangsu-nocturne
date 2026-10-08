/** 夜泊江苏 · 卡牌数据类型定义 */

export type Arcana = 'major' | 'minor';

export type SuitKey = 'wands' | 'cups' | 'swords' | 'pentacles';

/** 小牌等级：1=首卷 2-10=数字卷 11-14=收官四卷 */
export type MinorRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/** 大牌轮廓变奏参数（月芒尖碑骨架上的单牌个性） */
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

/** 夜景剪影母题（程序化夜景生成器的取件） */
export type MotifKind =
  | 'ferry'          // 画舫灯船
  | 'gate'           // 城门瓮城
  | 'garden'         // 园林月洞门
  | 'street'         // 水乡街巷
  | 'skyscraper'     // 现代天际线
  | 'pagoda'         // 宝塔
  | 'pavilion'       // 亭榭
  | 'bridge'         // 拱桥（含桥亭）
  | 'lighthouse'     // 灯塔
  | 'temple'         // 寺庙大殿
  | 'wall'           // 城墙垛口
  | 'lake'           // 开阔湖面
  | 'sea'            // 海平线
  | 'buddha'         // 大佛
  | 'hill'           // 山形塔影
  | 'banner';        // 门楼旌旗（故里）

export interface SpotArt {
  /** 剪影母题（1-2 个，横向排布） */
  motifs: MotifKind[];
  /** 月亮横向位置（0-1，默认 0.72） */
  moon?: number;
  /** 月相（'waxing' | 'full'，默认 'waxing'） */
  phase?: 'waxing' | 'full';
}

interface CardBase {
  id: string;
  arcana: Arcana;
  nameZh: string;
  nameEn: string;
  /** 所属城市 */
  city: string;
  keywords: string[];
  /** 主光色（夜色的光源色） */
  accent: string;
  /** 夜景剪影参数 */
  art: SpotArt;
}

export interface MajorCardData extends CardBase {
  arcana: 'major';
  num: number;
  roman: string;
  /** 一句话意境 */
  meaning: string;
  /** 灯语短句（夜航手记第一层） */
  oracle: string;
  /** 夜话解读（第二层） */
  interpretation: string;
  /** 收藏者批注（第三层，含落款） */
  note: string;
  shape: MajorShapeSpec;
}

export interface MinorCardData extends CardBase {
  arcana: 'minor';
  suit: SuitKey;
  rank: MinorRank;
  /** 一句话意境 */
  meaning: string;
  /** 灯语短句 */
  oracle: string;
  /** 夜航短注 */
  note: string;
}

export type CardData = MajorCardData | MinorCardData;

export const ROMAN = [
  '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI',
] as const;

/** 四大夜色系列 */
export const SUIT_ZH: Record<SuitKey, string> = {
  wands: '灯影', cups: '水岸', swords: '山寺', pentacles: '城垣',
};

export const SUIT_EN: Record<SuitKey, string> = {
  wands: 'Lantern Glow', cups: 'Waterfront', swords: 'Hill & Temple', pentacles: 'Old City',
};

/** 系列内卷序（第 1 卷 ~ 第 14 卷） */
export const RANK_ZH: Record<MinorRank, string> = {
  1: '卷一', 2: '卷二', 3: '卷三', 4: '卷四', 5: '卷五', 6: '卷六',
  7: '卷七', 8: '卷八', 9: '卷九', 10: '卷十', 11: '卷十一', 12: '卷十二', 13: '卷十三', 14: '卷十四',
};
