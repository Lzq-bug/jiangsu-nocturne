import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/game/rng';
import { rollDraw } from '@/game/draw';
import { ECONOMY } from '@/game/economy';
import { recordAcquire, ownedSet, progressPercent, type CollectionMap } from '@/game/collection';
import { payoutFor } from '@/game/economy';
import { isMajor } from '@/tarot/data';

const rngFor = (seed: number) => mulberry32(seed);

describe('启封抽牌', () => {
  it('同种子结果确定（确定性）', () => {
    const a = rollDraw(rngFor(42), { owned: new Set(), sinceLastNew: 0 });
    const b = rollDraw(rngFor(42), { owned: new Set(), sinceLastNew: 0 });
    expect(a.card.id).toBe(b.card.id);
    expect(a.isNew).toBe(b.isNew);
  });

  it('首次抽牌必为新卡', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = rollDraw(rngFor(seed), { owned: new Set(), sinceLastNew: 0 });
      expect(r.isNew).toBe(true);
    }
  });

  it('城章权重约为 25%（统计意义）', () => {
    let majors = 0;
    const N = 4000;
    const owned = new Set<string>();
    let since = 0;
    const rng = rngFor(7);
    for (let i = 0; i < N; i++) {
      const r = rollDraw(rng, { owned, sinceLastNew: since });
      if (isMajor(r.card)) majors++;
      if (r.isNew) {
        owned.add(r.card.id);
        since = 0;
      } else since++;
    }
    const ratio = majors / N;
    expect(ratio).toBeGreaterThan(0.18);
    expect(ratio).toBeLessThan(0.32);
  });

  it('收集保护：达到保底阈值必出新卡', () => {
    const owned = new Set(['major-0', 'major-1']);
    const r = rollDraw(rngFor(1), { owned, sinceLastNew: ECONOMY.pityThreshold - 1 });
    expect(r.isNew).toBe(true);
    expect(r.pityTriggered).toBe(true);
    expect(owned.has(r.card.id)).toBe(false);
  });

  it('未拥有卡享有加权（收集保护）', () => {
    // 全拥有某一级时重复率显著；未拥有时首抽必出未拥有加权卡
    const owned = new Set<string>(['major-0']);
    let unownedDraws = 0;
    const rng = rngFor(99);
    for (let i = 0; i < 500; i++) {
      const r = rollDraw(rng, { owned, sinceLastNew: 0 });
      if (!owned.has(r.card.id)) unownedDraws++;
    }
    // 未拥有仅 1 张（major-0 属于 25% 级），加权后应显著超过无加权期望
    expect(unownedDraws).toBeGreaterThan(30);
  });
});

describe('图鉴与资源', () => {
  it('记录获得：新卡与重复卡', () => {
    let col: CollectionMap = {};
    const card = { id: 'major-0' } as never;
    const first = recordAcquire(col, card as never, 1000);
    expect(first.delta.isNew).toBe(true);
    expect(first.next['major-0']).toEqual({ count: 1, firstAt: 1000, lastAt: 1000 });
    col = first.next;
    const second = recordAcquire(col, card as never, 2000);
    expect(second.delta.isNew).toBe(false);
    expect(second.delta.count).toBe(2);
    expect(second.next['major-0'].lastAt).toBe(2000);
    expect(second.next['major-0'].firstAt).toBe(1000);
  });

  it('进度计算', () => {
    const col: CollectionMap = {
      'major-0': { count: 1, firstAt: 0, lastAt: 0 },
      'major-1': { count: 3, firstAt: 0, lastAt: 0 },
    };
    expect(ownedSet(col).size).toBe(2);
    expect(progressPercent(col)).toBe(3); // 2/78 ≈ 2.56 → 3
  });
});

describe('观星台结算', () => {
  it('payout 公式与阈值加成', () => {
    expect(payoutFor(10, 0)).toBe(20);
    expect(payoutFor(0, 2)).toBe(12);
    expect(payoutFor(10, 2)).toBe(32);
    expect(payoutFor(19, 0)).toBe(38); // total 19 < 20 → 无加成
    expect(payoutFor(18, 2)).toBe(58); // total 20 → +10 加成
    expect(payoutFor(20, 0)).toBe(50); // total 20 → +10 加成
  });
});
