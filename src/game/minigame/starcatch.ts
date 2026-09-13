/**
 * 观星台 · 「捕星」玩法核心逻辑（纯函数，可单测）
 * 一局 45 秒：星屑星（2 分）与金星（6 分）自天幕漂过，点击捕获；
 * 结算星屑 = 捕获总值，满 20 颗另有加成。动画仅为表现，得分即结算。
 */
import { STAR_CATCH, payoutFor } from '../economy';
import type { Rng } from '../rng';

export interface StarSpec {
  id: number;
  /** 0=星屑星 1=金星 */
  kind: 0 | 1;
  /** 归一化出生点与漂移向量（0..1） */
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  bornAt: number;
  lifeMs: number;
}

export interface RoundState {
  stars: StarSpec[];
  nextId: number;
  caught: { stars: number; golds: number };
  startedAt: number;
  endedAt: number | null;
}

export function createRound(now: number): RoundState {
  return { stars: [], nextId: 1, caught: { stars: 0, golds: 0 }, startedAt: now, endedAt: null };
}

export function starLife(rng: Rng): number {
  return STAR_CATCH.starLifeMs * (0.8 + rng() * 0.4);
}

/** 生成一颗星（位置与漂移在画面内） */
export function spawnStar(state: RoundState, rng: Rng, now: number): StarSpec {
  const gold = rng() < 0.18;
  const fromLeft = rng() < 0.5;
  const star: StarSpec = {
    id: state.nextId++,
    kind: gold ? 1 : 0,
    x0: fromLeft ? -0.05 : 1.05,
    y0: 0.12 + rng() * 0.66,
    vx: (fromLeft ? 1 : -1) * (0.055 + rng() * 0.075),
    vy: (rng() - 0.5) * 0.05,
    bornAt: now,
    lifeMs: starLife(rng),
  };
  state.stars.push(star);
  return star;
}

export interface TickResult {
  expired: number[];
}

/** 推进一帧：清理过期星星；endedAt 由外部到点后设置 */
export function tick(state: RoundState, now: number): TickResult {
  const expired: number[] = [];
  state.stars = state.stars.filter((s) => {
    const alive = now - s.bornAt < s.lifeMs;
    if (!alive) expired.push(s.id);
    return alive;
  });
  return { expired };
}

export function starPos(s: StarSpec, now: number): { x: number; y: number } {
  const t = Math.min(1, (now - s.bornAt) / s.lifeMs);
  return {
    x: clamp01(s.x0 + s.vx * (now - s.bornAt) / 1000),
    y: clamp01(s.y0 + s.vy * (now - s.bornAt) / 1000 + 0.08 * t),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function catchStar(state: RoundState, id: number, now: number): boolean {
  const idx = state.stars.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  const s = state.stars[idx];
  state.stars.splice(idx, 1);
  if (s.kind === 1) state.caught.golds += 1;
  else state.caught.stars += 1;
  void now;
  return true;
}

export function remainingSec(state: RoundState, now: number): number {
  return Math.max(0, Math.ceil((STAR_CATCH.durationSec * 1000 - (now - state.startedAt)) / 1000));
}

export function isRoundOver(state: RoundState, now: number): boolean {
  return now - state.startedAt >= STAR_CATCH.durationSec * 1000;
}

export function settle(state: RoundState): { stardust: number; stars: number; golds: number; total: number } {
  const { stars, golds } = state.caught;
  return { stardust: payoutFor(stars, golds), stars, golds, total: stars + golds };
}
