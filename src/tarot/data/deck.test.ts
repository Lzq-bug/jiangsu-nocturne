import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARD_BY_ID, DECK_SIZE, cardsBySuit, isMajor } from '@/tarot/data';
import { MAJORS } from '@/tarot/data/majors';
import { MINORS } from '@/tarot/data/minors';
import { SUITS } from '@/tarot/data/minorSource';

describe('78 帧夜色数据完整性', () => {
  it('总数为 78：22 城章 + 56 夜签', () => {
    expect(MAJORS).toHaveLength(22);
    expect(MINORS).toHaveLength(56);
    expect(ALL_CARDS).toHaveLength(78);
    expect(DECK_SIZE).toBe(78);
  });

  it('ID 唯一', () => {
    const ids = new Set(ALL_CARDS.map((c) => c.id));
    expect(ids.size).toBe(78);
  });

  it('城章席位 0-21 且罗马数字齐全、名称完整', () => {
    expect(MAJORS.map((m) => m.num).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 22 }, (_, i) => i),
    );
    for (const m of MAJORS) {
      expect(m.nameZh.length).toBeGreaterThan(0);
      expect(m.nameEn.length).toBeGreaterThan(0);
      expect(m.city.length).toBeGreaterThan(0);
      expect(m.roman.length).toBeGreaterThan(0);
      expect(m.oracle.length).toBeGreaterThan(0);
      expect(m.interpretation.length).toBeGreaterThan(0);
      expect(m.note).toContain('夜航手记');
      expect(m.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(m.keywords.length).toBeGreaterThanOrEqual(3);
      expect(m.art.motifs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('夜签四系列各 14 卷，卷序完整、景点不重复', () => {
    for (const s of SUITS) {
      const cards = cardsBySuit(s.key);
      expect(cards).toHaveLength(14);
      expect(cards.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      for (const c of cards) {
        expect(c.nameZh.length).toBeGreaterThan(0);
        expect(c.city.length).toBeGreaterThan(0);
        expect(c.note.length).toBeGreaterThan(4);
        expect(c.oracle.length).toBeGreaterThan(2);
        expect(c.note.endsWith('——夜航手记·夜签')).toBe(true);
      }
      expect(new Set(cards.map((c) => c.nameZh)).size).toBe(14);
    }
  });

  it('全册景点名称不重复、覆盖多城市', () => {
    const names = ALL_CARDS.map((c) => c.nameZh);
    expect(new Set(names).size).toBe(78);
    const cities = new Set(ALL_CARDS.map((c) => c.city));
    expect(cities.size).toBeGreaterThanOrEqual(13); // 覆盖江苏 13 个设区市
  });

  it('城章文案长度在规范区间（80-220 字）', () => {
    for (const m of MAJORS) {
      const total = m.oracle.length + m.interpretation.length + m.note.length;
      expect(total).toBeGreaterThanOrEqual(80);
      expect(total).toBeLessThanOrEqual(220);
    }
  });

  it('按 ID 查询与集合一致', () => {
    expect(CARD_BY_ID.size).toBe(78);
    for (const c of ALL_CARDS) expect(CARD_BY_ID.get(c.id)).toBe(c);
    expect(isMajor(CARD_BY_ID.get('major-0')!)).toBe(true);
  });
});
