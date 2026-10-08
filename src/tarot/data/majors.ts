/**
 * 城章 · 22 张大牌
 * 由「城章景点源数据」（src/spots/majorSpots.ts）组装为完整卡牌数据。
 * 轮廓沿用「月芒尖碑」异形卡牌骨架，为每席分配独立形制。
 */
import { ROMAN, type MajorCardData, type MajorShapeSpec } from '../types';
import { MAJOR_SPOTS } from '@/spots/majorSpots';

/** 22 席轮廓形制表（每席独立，保持收集时的辨识度） */
const SHAPES: MajorShapeSpec[] = [
  { tilt: 8, steps: 2, wing: 'standard', top: 'apex', side: 'straight' },          // 0 秦淮画舫
  { tilt: 0, steps: 3, wing: 'standard', top: 'flat', side: 'straight' },          // 1 中华门
  { tilt: -6, steps: 3, wing: 'leaf', top: 'apex', side: 'wave' },                 // 2 拙政园
  { tilt: 4, steps: 2, wing: 'ribbon', top: 'wave', side: 'wave' },                // 3 平江路
  { tilt: 0, steps: 3, wing: 'raised', top: 'twin', side: 'straight' },            // 4 金鸡湖
  { tilt: -8, steps: 3, wing: 'standard', top: 'apex', side: 'straight', cut: 'crescent' }, // 5 寒山寺
  { tilt: 0, steps: 3, wing: 'standard', top: 'triple', side: 'straight' },        // 6 五亭桥
  { tilt: 6, steps: 2, wing: 'standard', top: 'ripple', side: 'straight' },        // 7 东关街
  { tilt: -4, steps: 3, wing: 'ring', top: 'apex', side: 'straight', cut: 'ringCut' }, // 8 清名桥
  { tilt: 10, steps: 2, wing: 'raised', top: 'ray', side: 'straight' },            // 9 鼋头渚
  { tilt: 0, steps: 3, wing: 'standard', top: 'broken', side: 'scythe' },          // 10 西津渡
  { tilt: -10, steps: 3, wing: 'standard', top: 'triple', side: 'straight' },      // 11 金山寺
  { tilt: 0, steps: 3, wing: 'raised', top: 'apex', side: 'straight', cut: 'lightHole' }, // 12 天宁宝塔
  { tilt: 6, steps: 2, wing: 'leaf', top: 'wave', side: 'straight' },              // 13 青果巷
  { tilt: -6, steps: 3, wing: 'ribbon', top: 'ripple', side: 'wave' },             // 14 濠河
  { tilt: 8, steps: 2, wing: 'standard', top: 'split', side: 'straight' },         // 15 连岛
  { tilt: 0, steps: 3, wing: 'ring', top: 'twin', side: 'straight' },              // 16 云龙湖
  { tilt: -4, steps: 2, wing: 'standard', top: 'apex', side: 'straight' },         // 17 望海楼
  { tilt: 4, steps: 3, wing: 'standard', top: 'flat', side: 'straight' },          // 18 清江浦
  { tilt: -8, steps: 3, wing: 'standard', top: 'horn', side: 'straight' },         // 19 东晋水城
  { tilt: 0, steps: 2, wing: 'raised', top: 'horn', side: 'straight' },            // 20 项王故里
  { tilt: 0, steps: 3, wing: 'ring', top: 'ray', side: 'straight', cut: 'ringCut' }, // 21 江海夜潮
];

export const MAJORS: MajorCardData[] = MAJOR_SPOTS.map((s) => ({
  id: `major-${s.slot}`,
  arcana: 'major' as const,
  num: s.slot,
  roman: ROMAN[s.slot],
  nameZh: s.nameZh,
  nameEn: s.nameEn,
  city: s.city,
  keywords: s.keywords,
  accent: s.accent,
  meaning: s.meaning,
  oracle: s.oracle,
  interpretation: s.interpretation,
  note: s.note,
  shape: SHAPES[s.slot],
  art: s.art,
}));
