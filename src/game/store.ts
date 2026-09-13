/**
 * 全局游戏状态（zustand）
 * 唯一写入口：所有游戏状态变更经此进行，并自动持久化到本地存档。
 * 引擎（draw/economy/collection）为纯函数，store 只负责编排与持久化。
 */
import { create } from 'zustand';
import { recordAcquire, type CollectionMap } from './collection';
import { ECONOMY, STAR_CATCH } from './economy';
import { rollDraw, type DrawOutcome } from './draw';
import { createRng, type Rng } from './rng';
import { defaultSave, loadSave, parseSave, persistSave, SAVE_VERSION, type GameSettings, type SaveData } from './save';

export interface UnsealResult extends DrawOutcome {
  refund: number;
}

interface GameStore {
  ready: boolean;
  stardust: number;
  totalDraws: number;
  sinceLastNew: number;
  collection: CollectionMap;
  stats: SaveData['stats'];
  settings: GameSettings;
  /** 最近一次启封结果（供仪式动画使用） */
  lastUnseal: UnsealResult | null;

  init: () => void;
  canUnseal: () => boolean;
  unseal: () => UnsealResult | null;
  clearLastUnseal: () => void;
  finishStarCatch: (result: { stardust: number; stars: number; golds: number; total: number }) => void;
  updateSettings: (patch: Partial<GameSettings>) => void;
  exportSaveJson: () => string;
  importSaveJson: (json: string) => boolean;
  resetSave: () => void;
}

let rng: Rng = createRng().rng;
let persistTimer: number | undefined;

function snapshot(s: GameStore): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: (snapshotCreatedAt ?? Date.now()),
    updatedAt: Date.now(),
    stardust: s.stardust,
    totalDraws: s.totalDraws,
    sinceLastNew: s.sinceLastNew,
    collection: s.collection,
    stats: s.stats,
    settings: s.settings,
  };
}

let snapshotCreatedAt: number | null = null;

function schedulePersist(get: () => GameStore): void {
  if (typeof window === 'undefined') return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistSave(snapshot(get()));
  }, 250);
}

export const useGame = create<GameStore>((set, get) => ({
  ready: false,
  stardust: 0,
  totalDraws: 0,
  sinceLastNew: 0,
  collection: {},
  stats: { gamesPlayed: 0, starsCaught: 0, bestRound: 0 },
  settings: defaultSave().settings,
  lastUnseal: null,

  init: () => {
    const data = loadSave();
    snapshotCreatedAt = data.createdAt;
    rng = createRng().rng;
    set({
      ready: true,
      stardust: data.stardust,
      totalDraws: data.totalDraws,
      sinceLastNew: data.sinceLastNew,
      collection: data.collection,
      stats: data.stats,
      settings: data.settings,
    });
  },

  canUnseal: () => get().stardust >= ECONOMY.unsealCost,

  unseal: () => {
    const s = get();
    if (s.stardust < ECONOMY.unsealCost) return null;
    const outcome = rollDraw(rng, {
      owned: new Set(Object.keys(s.collection)),
      sinceLastNew: s.sinceLastNew,
    });
    const at = Date.now();
    const { next } = recordAcquire(s.collection, outcome.card, at);
    const refund = outcome.isNew ? 0 : ECONOMY.duplicateRefund;
    const result: UnsealResult = { ...outcome, refund };
    set({
      stardust: s.stardust - ECONOMY.unsealCost + refund,
      totalDraws: s.totalDraws + 1,
      sinceLastNew: outcome.isNew ? 0 : s.sinceLastNew + 1,
      collection: next,
      lastUnseal: result,
    });
    schedulePersist(get);
    return result;
  },

  clearLastUnseal: () => set({ lastUnseal: null }),

  finishStarCatch: (result) => {
    const s = get();
    set({
      stardust: s.stardust + result.stardust,
      stats: {
        gamesPlayed: s.stats.gamesPlayed + 1,
        starsCaught: s.stats.starsCaught + result.total,
        bestRound: Math.max(s.stats.bestRound, result.total),
      },
    });
    schedulePersist(get);
  },

  updateSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    schedulePersist(get);
  },

  exportSaveJson: () => JSON.stringify(snapshot(get()), null, 2),

  importSaveJson: (json) => {
    try {
      const data = parseSave(json);
      if (data.version !== SAVE_VERSION) return false;
      snapshotCreatedAt = data.createdAt;
      set({
        ready: true,
        stardust: data.stardust,
        totalDraws: data.totalDraws,
        sinceLastNew: data.sinceLastNew,
        collection: data.collection,
        stats: data.stats,
        settings: data.settings,
      });
      schedulePersist(get);
      return true;
    } catch {
      return false;
    }
  },

  resetSave: () => {
    const fresh = defaultSave();
    snapshotCreatedAt = fresh.createdAt;
    set({
      stardust: fresh.stardust,
      totalDraws: fresh.totalDraws,
      sinceLastNew: fresh.sinceLastNew,
      collection: fresh.collection,
      stats: fresh.stats,
      settings: fresh.settings,
      lastUnseal: null,
    });
    schedulePersist(get);
  },
}));

/** 供测试与外部脚本使用 */
export { ECONOMY, STAR_CATCH };
