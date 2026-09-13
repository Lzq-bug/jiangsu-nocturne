/**
 * 本地存档（localStorage，schema v1）
 * - 带版本号，可迁移；JSON 解析失败时回退默认档，绝不炸应用
 * - 支持 export / import（JSON 字符串）
 */
import type { CollectionMap } from './collection';

export const SAVE_KEY = 'veiled-moon.save.v1';
export const SAVE_VERSION = 1;

export interface GameSettings {
  master: number;
  bgm: number;
  sfx: number;
  muted: boolean;
  reducedMotion: boolean;
  /** 可选星语 AI：DeepSeek 兼容 Key（仅存本地） */
  apiKey: string;
  apiBaseUrl: string;
  modelId: string;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  /** 星屑 */
  stardust: number;
  /** 累计启封次数 */
  totalDraws: number;
  /** 距上次新卡的启封次数（保底计数） */
  sinceLastNew: number;
  /** 图鉴 */
  collection: CollectionMap;
  /** 观星台统计 */
  stats: { gamesPlayed: number; starsCaught: number; bestRound: number };
  settings: GameSettings;
}

export function defaultSettings(): GameSettings {
  return {
    master: 0.8, bgm: 0.5, sfx: 0.8, muted: false, reducedMotion: false,
    apiKey: '', apiBaseUrl: '/__api', modelId: 'deepseek-chat',
  };
}

export function defaultSave(): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    stardust: 60,
    totalDraws: 0,
    sinceLastNew: 0,
    collection: {},
    stats: { gamesPlayed: 0, starsCaught: 0, bestRound: 0 },
    settings: defaultSettings(),
  };
}

/** v0（无版本号的初版）→ v1 */
function migrateV0(raw: Record<string, unknown>): SaveData {
  const base = defaultSave();
  return {
    ...base,
    version: SAVE_VERSION,
    stardust: typeof raw.stardust === 'number' ? raw.stardust : base.stardust,
    collection: (raw.collection ?? {}) as CollectionMap,
  };
}

/** 解析并迁移任意来源的存档 JSON；永不抛错 */
export function parseSave(json: string | null): SaveData {
  if (!json) return defaultSave();
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return defaultSave();
    const version = typeof raw.version === 'number' ? raw.version : 0;
    let data: SaveData;
    if (version <= 0) data = migrateV0(raw);
    else data = { ...defaultSave(), ...(raw as unknown as SaveData), version: SAVE_VERSION };
    return sanitize(data);
  } catch {
    return defaultSave();
  }
}

/** 防御性修补：任何字段非法时回落默认值 */
function clamp01(v: unknown, d: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d;
  return Math.min(1, Math.max(0, v));
}

function sanitize(data: SaveData): SaveData {
  const base = defaultSave();
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const collection: CollectionMap = {};
  if (data.collection && typeof data.collection === 'object') {
    for (const [id, entry] of Object.entries(data.collection)) {
      if (entry && typeof entry.count === 'number' && entry.count > 0) {
        collection[id] = {
          count: Math.floor(entry.count),
          firstAt: num(entry.firstAt, Date.now()),
          lastAt: num(entry.lastAt, entry.firstAt ?? Date.now()),
        };
      }
    }
  }
  const s = data.settings ?? {} as Partial<GameSettings>;
  const def = defaultSettings();
  return {
    version: SAVE_VERSION,
    createdAt: num(data.createdAt, base.createdAt),
    updatedAt: num(data.updatedAt, base.updatedAt),
    stardust: Math.max(0, Math.floor(num(data.stardust, base.stardust))),
    totalDraws: Math.max(0, Math.floor(num(data.totalDraws, 0))),
    sinceLastNew: Math.max(0, Math.floor(num(data.sinceLastNew, 0))),
    collection,
    stats: {
      gamesPlayed: Math.max(0, Math.floor(num(data.stats?.gamesPlayed, 0))),
      starsCaught: Math.max(0, Math.floor(num(data.stats?.starsCaught, 0))),
      bestRound: Math.max(0, Math.floor(num(data.stats?.bestRound, 0))),
    },
    settings: {
      master: clamp01(s.master, def.master),
      bgm: clamp01(s.bgm, def.bgm),
      sfx: clamp01(s.sfx, def.sfx),
      muted: bool(s.muted, def.muted),
      reducedMotion: bool(s.reducedMotion, def.reducedMotion),
      apiKey: str(s.apiKey, ''),
      apiBaseUrl: str(s.apiBaseUrl, def.apiBaseUrl),
      modelId: str(s.modelId, def.modelId),
    },
  };
}

export function loadSave(storage: Storage = window.localStorage): SaveData {
  try {
    return parseSave(storage.getItem(SAVE_KEY));
  } catch {
    return defaultSave();
  }
}

export function persistSave(data: SaveData, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, updatedAt: Date.now() }));
  } catch {
    // 存储不可用（隐私模式等）时静默降级为内存态，游戏照常运行
  }
}

export function exportSave(data: SaveData): string {
  return JSON.stringify({ ...data, version: SAVE_VERSION, exportedAt: Date.now() }, null, 2);
}

export function importSave(json: string): SaveData {
  const data = parseSave(json);
  return data;
}
