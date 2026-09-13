import { describe, expect, it } from 'vitest';
import { ARTWORK_BY_CARD, artworkFor, ARTWORK_COUNT } from './artwork';
import { ALL_CARDS, getCardById } from './data';
import { defaultSave, parseSave } from '@/game/save';
import { rollDraw } from '@/game/draw';
import { mulberry32 } from '@/game/rng';

const PILOT_IDS = ['major-0', 'major-6', 'major-13', 'major-21', 'minor-wands-1', 'minor-cups-2', 'minor-swords-3', 'minor-pentacles-14'];

describe('正式卡面美术注册表', () => {
  it('每一条登记都是合法 cardId，且数量与登记表一致', () => {
    const registered = Object.keys(ARTWORK_BY_CARD);
    expect(registered.length).toBe(ARTWORK_COUNT);
    expect(registered.length).toBeGreaterThanOrEqual(8); // 试制 8 张为底
    for (const id of registered) {
      expect(getCardById(id), `unknown card id: ${id}`).toBeDefined();
    }
  });

  it('8 张试制牌必须永远保持登记（回归保护）', () => {
    for (const id of PILOT_IDS) {
      expect(artworkFor(id), `pilot artwork missing: ${id}`).toBeTruthy();
    }
  });

  it('URL 无断裂：登记必有 URL；未登记的动态取样返回 undefined', () => {
    for (const id of Object.keys(ARTWORK_BY_CARD)) expect(artworkFor(id)).toBeTruthy();
    // 动态找一个尚未登记的牌 → 必须走 fallback
    const unregistered = ALL_CARDS.find((c) => !(c.id in ARTWORK_BY_CARD));
    if (unregistered) expect(artworkFor(unregistered.id)).toBeUndefined();
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
