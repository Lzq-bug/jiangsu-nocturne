/**
 * 实景照片注册表：src/assets/photos/{cardKey}.jpg → data URI
 * 命名约定：城章 major-{num}.jpg；夜签 {suit}-{rank}.jpg（如 wands-1.jpg）。
 * 有照片 → 卡面画窗优先使用实景；无照片 → 回退程序化夜景（nightScene）。
 * 来源清单见 src/assets/photos/CREDITS.tsv。
 */
import type { CardData } from '@/tarot/types';

const files = import.meta.glob('../assets/photos/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const PHOTO_BY_KEY: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const base = path.split('/').pop()?.replace(/\.jpg$/, '');
  if (base && base !== 'CREDITS') PHOTO_BY_KEY[base] = url;
}

function photoKey(card: CardData): string {
  return card.arcana === 'major'
    ? `major-${card.num}`
    : `${card.suit}-${card.rank}`;
}

/** 有实景照片 → 返回 URL；否则 undefined（走程序化夜景） */
export function photoFor(card: CardData): string | undefined {
  return PHOTO_BY_KEY[photoKey(card)];
}

/** 已收录实景照片数量（测试与文档用） */
export const PHOTO_COUNT = Object.keys(PHOTO_BY_KEY).length;
