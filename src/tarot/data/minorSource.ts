/**
 * 夜签素材源 · 四大夜色系列元数据 + 批注模板
 * 四系列对应原四花色键位（wands/cups/swords/pentacles），存档兼容不变。
 */
import type { SuitKey } from '../types';

export interface SuitMeta {
  key: SuitKey;
  zh: string;
  element: string;
  theme: string;
  /** 系列主色 */
  accent: string;
  /** 系列深色（牌面底纹） */
  deep: string;
  /** 系列符记 */
  sigil: string;
}

export const SUITS: SuitMeta[] = [
  { key: 'wands', zh: '灯影', element: '灯', theme: '灯会、夜市、楼阁与人间烟火', accent: '#D9814E', deep: '#2A1A14', sigil: '琉璃灯' },
  { key: 'cups', zh: '水岸', element: '水', theme: '水乡、河街、画舫与桨声灯影', accent: '#6FC2C9', deep: '#12222A', sigil: '乌篷船' },
  { key: 'swords', zh: '山寺', element: '山', theme: '山林、古寺、塔影与钟声', accent: '#9FB6D9', deep: '#161D2C', sigil: '山月钟' },
  { key: 'pentacles', zh: '城垣', element: '城', theme: '城墙、园林、老宅与岁月肌理', accent: '#A8B87A', deep: '#1A2114', sigil: '瓮城砖' },
];

/** 数字卷（1-10）夜航短注模板，{k} 为景点关键词占位 */
export const SERIES_NOTE_TEMPLATE: Record<SuitKey, string> = {
  wands: '船工把这串灯影誊进夜航册——「{k}」。灯不问夜多深，亮过就是答案。',
  cups: '船工把这湾水色收进夜航册——「{k}」。水记得每一盏灯的样子。',
  swords: '船工把这记钟声录进夜航册——「{k}」。山寺的夜，安静得有声。',
  pentacles: '船工把这垛城砖拓进夜航册——「{k}」。砖石的答复慢，但从不缺席。',
};

/** 收官四卷（11-14）夜航短注，{k} 为关键词 */
export const CLOSING_NOTE_TEMPLATE: Record<SuitKey, string> = {
  wands: '夜航将尽，这一串灯影是压舱的暖——「{k}」。',
  cups: '夜航将尽，这一湾水色替全册收梢——「{k}」。',
  swords: '夜航将尽，这一记钟声是归途的钟——「{k}」。',
  pentacles: '夜航将尽，这一垛城砖是此岸的印——「{k}」。',
};
