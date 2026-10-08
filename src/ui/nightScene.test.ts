import { describe, expect, it } from 'vitest';
import { nightCardSVG, nightPanoSVG, svgToURI, hashSeed } from '@/ui/nightScene';
import { nightArtFor, nightPanoFor } from '@/ui/nightArt';
import { ALL_CARDS, getCardById } from '@/tarot/data';

describe('程序化夜景生成器', () => {
  it('每张卡都能生成合法卡面 SVG 与全景 SVG', () => {
    for (const card of ALL_CARDS) {
      const cardSvg = nightCardSVG(card.id, card.accent, card.art, card.arcana === 'minor');
      expect(cardSvg.startsWith('<svg')).toBe(true);
      expect(cardSvg.endsWith('</svg>')).toBe(true);
      expect(cardSvg).toContain('<defs>');
      expect(cardSvg).toContain('fill="url(#sg)"');
      const panoSvg = nightPanoSVG(card.id, card.accent, card.art);
      expect(panoSvg.startsWith('<svg')).toBe(true);
      expect(panoSvg).toContain('2880');
    }
  });

  it('同 id 确定性：两次生成完全一致', () => {
    const card = getCardById('major-0')!;
    const a = nightCardSVG(card.id, card.accent, card.art, false);
    const b = nightCardSVG(card.id, card.accent, card.art, false);
    expect(a).toBe(b);
    expect(hashSeed(card.id)).toBe(hashSeed(card.id));
  });

  it('不同母题产出不同画面', () => {
    const ferry = getCardById('major-0')!;
    const gate = getCardById('major-1')!;
    expect(nightCardSVG(ferry.id, ferry.accent, ferry.art, false))
      .not.toBe(nightCardSVG(gate.id, gate.accent, gate.art, false));
  });

  it('data URI 编码不含裸 # 号', () => {
    const uri = svgToURI(nightCardSVG('major-0', '#F2B24C', { motifs: ['ferry'] }, false));
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(uri.slice(uri.indexOf(',') + 1)).not.toContain('#');
  });

  it('美术注册表缓存稳定且覆盖全部卡牌', () => {
    for (const card of ALL_CARDS) {
      expect(nightArtFor(card)).toBe(nightArtFor(card));
      expect(nightPanoFor(card)).toBeTruthy();
    }
  });
});
