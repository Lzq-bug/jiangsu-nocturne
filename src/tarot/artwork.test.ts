import { describe, expect, it } from 'vitest';
import { ARTWORK_BY_CARD, artworkFor, ARTWORK_COUNT } from './artwork';
import { ALL_CARDS, getCardById } from './data';
import { defaultSave, parseSave } from '@/game/save';
import { rollDraw } from '@/game/draw';
import { mulberry32 } from '@/game/rng';

const PILOT_IDS = ['major-0', 'major-6', 'major-13', 'major-21', 'minor-wands-1', 'minor-cups-2', 'minor-swords-3', 'minor-pentacles-14'];

describe('正式卡面美术（8 张试制）', () => {
  it('恰好 8 张登记，且全部为合法 cardId', () => {
    expect(ARTWORK_COUNT).toBe(8);
    for (const id of Object.keys(ARTWORK_BY_CARD)) {
      expect(getCardById(id), `unknown card id: ${id}`).toBeDefined();
    }
  });

  it('8 张试制牌全部有可用的资产 URL', () => {
    for (const id of PILOT_IDS) {
      const url = artworkFor(id);
      expect(url, `missing artwork url for ${id}`).toBeTruthy();
      expect(url).toMatch(/\.svg$/);
    }
  });

  it('URL 无断裂：登记了的 cardId 必有 URL；未登记的返回 undefined', () => {
    for (const id of PILOT_IDS) expect(artworkFor(id)).toBeTruthy();
    // 未登记 → fallback
    expect(artworkFor('major-1')).toBeUndefined();
    expect(artworkFor('minor-cups-5')).toBeUndefined();
    expect(artworkFor('not-a-card')).toBeUndefined();
    // 无 undefined 值混入注册表
    for (const [id, url] of Object.entries(ARTWORK_BY_CARD)) {
      expect(url, `broken asset path for ${id}`).toBeTruthy();
    }
  });

  it('artwork 不影响抽牌逻辑：同种子同结果', () => {
    const a = rollDraw(mulberry32(7), { owned: new Set(), sinceLastNew: 0 });
    const b = rollDraw(mulberry32(7), { owned: new Set(), sinceLastNew: 0 });
    expect(a.card.id).toBe(b.card.id);
    expect(ALL_CARDS).toHaveLength(78);
  });

  it('artwork 不影响存档结构', () => {
    const data = defaultSave();
    const json = JSON.stringify(data);
    expect(parseSave(json).version).toBe(data.version);
    // 存档不包含 artwork 字段
    expect(json).not.toContain('artwork');
  });
});
