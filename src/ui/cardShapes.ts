/**
 * 月章「月芒尖碑」轮廓生成器（viewBox 100×232）
 *
 * 依据《宵月秘藏》视觉规范 3.2，骨架统一为四段：
 *   月芒顶（不对称主尖 + 左肩新月凹刻）→ 直腹（可带侧翼提耳）→ 三级/二级月台座。
 * 单牌变奏维度：主尖倾角 tilt / 台阶级数 steps / 侧翼 wing / 侧身 side（镰刃·波弧）/
 * 倒置 inverted（倒吊人）/ 附加环带（世界）。顶部形制 top 以「顶冠纹章」形式
 * 绘制于牌内顶部（crest 库见 motifs），骨架保持系列统一。
 */
import type { MajorShapeSpec } from '@/tarot/types';

const APEX_Y = 9;
const SHOULDER_Y = 30;
const BELLY_Y = 128;
const BASE_Y = 202;
const X_R = 87;
const X_L = 13;

export function majorOutlinePath(s: MajorShapeSpec): string {
  const apexX = 50 + Math.max(-16, Math.min(16, s.tilt));

  const wingOutR = s.wing === 'none' ? 0 : s.wing === 'ring' ? 5 : 6;

  // ── 右侧：主尖 → 右肩 → 直腹（侧翼/镰刃/波弧变奏）→ 底 ──
  let rightBelly: string;
  if (s.side === 'scythe') {
    rightBelly = `C 101 78, 99 150, ${X_R} ${BASE_Y}`;
  } else if (s.side === 'wave') {
    rightBelly = `C 90 66, 94 92, 89 108 C 85 124, 92 150, ${X_R} ${BASE_Y}`;
  } else if (wingOutR > 0) {
    rightBelly = `L ${X_R} 96 L ${X_R + wingOutR} 106 C ${X_R + wingOutR} 116, ${X_R + 2} 114, ${X_R + 1} 124 L ${X_R - 2} ${BELLY_Y} L ${X_R} ${BASE_Y}`;
  } else {
    rightBelly = `L ${X_R - 2} ${BELLY_Y} L ${X_R} ${BASE_Y}`;
  }

  // ── 左侧：底 → 直腹（侧翼镜像）→ 左肩 → 新月凹刻 → 主尖 ──
  const wingOutL = wingOutR;
  let leftBelly: string;
  if (s.side === 'wave') {
    leftBelly = `C 8 150, 15 124, 11 108 C 6 92, 10 66, ${X_L} ${SHOULDER_Y}`;
  } else if (wingOutL > 0) {
    leftBelly = `L ${X_L - 2} ${BELLY_Y} L ${X_L - 1} 124 C ${X_L - 2} 114, ${X_L - wingOutL} 116, ${X_L - wingOutL} 106 L ${X_L} 96 L ${X_L} ${SHOULDER_Y}`;
  } else {
    leftBelly = `L ${X_L - 2} ${BELLY_Y} L ${X_L} 96 L ${X_L} ${SHOULDER_Y}`;
  }

  // 左肩新月凹刻 → 主尖（月芒顶的不对称来源）
  const crest = `C ${X_L + 4} ${SHOULDER_Y - 9}, ${apexX - 14} ${APEX_Y + 6}, ${apexX - 7} ${APEX_Y + 3} C ${apexX - 3} ${APEX_Y + 1}, ${apexX - 1} ${APEX_Y}, ${apexX} ${APEX_Y}`;

  // 台座段必须延续当前子路径（不得带 M，否则 Z 闭合会产生穿牌对角线）
  const steps = s.steps === 2
    ? `L 64 206 L 68 214 L 32 214 L 36 206 L ${X_L} ${BASE_Y}`
    : `L 66 206 L 69 213 L 73 219 L 27 219 L 31 213 L 34 206 L ${X_L} ${BASE_Y}`;

  return [
    `M ${apexX} ${APEX_Y}`,
    `C ${apexX + 3} ${APEX_Y + 2}, ${apexX + 8} ${APEX_Y + 6}, ${apexX + 12} ${APEX_Y + 11}`,
    `C ${apexX + 22} ${APEX_Y + 4}, ${X_R - 12} ${SHOULDER_Y - 10}, ${X_R} ${SHOULDER_Y}`,
    rightBelly,
    steps,               // 底座（右→左）
    leftBelly,
    crest,
    'Z',
  ].join(' ');
}

/** 台座描边（供缩略图增强：单独的台阶边缘路径，右底 → 左底） */
export function majorPedestalPath(steps: 2 | 3): string {
  return steps === 2
    ? `M ${X_R} ${BASE_Y} L 64 206 L 68 214 L 32 214 L 36 206 L ${X_L} ${BASE_Y}`
    : `M ${X_R} ${BASE_Y} L 66 206 L 69 213 L 73 219 L 27 219 L 31 213 L 34 206 L ${X_L} ${BASE_Y}`;
}

/** 世界的腰间环带（若即若离的外环） */
export function worldRingPath(): string {
  return 'M 50 66 C 22 66, 4 96, 4 132 C 4 172, 24 200, 50 200 C 76 200, 96 172, 96 132 C 96 96, 78 66, 50 66 Z';
}

/** 星签四花色轮廓（viewBox 100×160，见视觉规范 3.3） */
export type MinorShapeKind = 'wands' | 'cups' | 'swords' | 'pentacles';

export function minorOutlinePath(kind: MinorShapeKind): string {
  switch (kind) {
    case 'wands': // 火熜形：偏右焰尖 + 左侧焰舌卷曲 + 微收直腹 + 平底
      return [
        'M 54 5',
        'C 60 13, 64 22, 62 30',       // 焰右缘下行
        'C 74 38, 82 48, 83 58',       // 右肩
        'L 83 118 L 79 148 L 21 148 L 17 118 L 17 58',
        'C 18 48, 26 38, 38 30',       // 左肩上行
        'C 33 24, 36 16, 40 10',       // 左焰舌
        'C 44 16, 49 11, 54 5',        // 合回焰尖
        'Z',
      ].join(' ');
    case 'cups': // 圣爵形：圆拱爵口 + 收腰 + 外撇爵足
      return [
        'M 50 8',
        'C 74 8, 86 26, 86 44',        // 右拱
        'L 86 84 C 86 100, 78 108, 70 114',  // 右收腰
        'L 78 132 L 84 150 L 16 150 L 22 132 L 30 114', // 爵足外撇
        'C 22 108, 14 100, 14 84',
        'L 14 44 C 14 26, 26 8, 50 8',
        'Z',
      ].join(' ');
    case 'swords': // 剑锋形：45° 双斜切汇于偏左剑尖 + 底部护手凹槽
      return [
        'M 47 6',
        'L 78 30',                      // 右斜刃
        'L 78 118 L 84 130 L 70 126 L 70 150 L 30 150 L 30 126 L 16 130 L 22 118 L 22 30', // 护手
        'L 47 6',
        'Z',
      ].join(' ');
    case 'pentacles': // 环璧形：纵长八角 + 中轴暗环（环另绘）
      return [
        'M 50 6 L 82 28 L 82 130 L 50 152 L 18 130 L 18 28 Z',
      ].join(' ');
  }
}

/** 星币中轴环线 */
export function pentacleRingPath(): string {
  return 'M 50 34 C 66 34, 74 56, 74 79 C 74 102, 66 124, 50 124 C 34 124, 26 102, 26 79 C 26 56, 34 34, 50 34 Z';
}
