/**
 * 夜景美术注册表：cardId → 生成的夜景 data URI（带缓存）
 * 取代旧的静态 SVG 资产注册表——全部卡面由 nightScene 程序化生成。
 */
import type { CardData } from '@/tarot/types';
import { nightCardSVG, nightPanoSVG, svgToURI } from './nightScene';

const cardCache = new Map<string, string>();
const panoCache = new Map<string, string>();

/** 卡面夜景 data URI（按 id 缓存） */
export function nightArtFor(card: CardData): string {
  const hit = cardCache.get(card.id);
  if (hit) return hit;
  const uri = svgToURI(nightCardSVG(card.id, card.accent, card.art, card.arcana === 'minor'));
  cardCache.set(card.id, uri);
  return uri;
}

/** 全景环幕 data URI（按 id 缓存，懒生成） */
export function nightPanoFor(card: CardData): string {
  const hit = panoCache.get(card.id);
  if (hit) return hit;
  const uri = svgToURI(nightPanoSVG(card.id, card.accent, card.art));
  panoCache.set(card.id, uri);
  return uri;
}
