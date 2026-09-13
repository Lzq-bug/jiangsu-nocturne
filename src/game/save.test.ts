// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultSave, exportSave, importSave, parseSave, persistSave, loadSave, SAVE_KEY, SAVE_VERSION,
} from './save';
import { useGame } from './store';
import { ECONOMY } from './economy';

beforeEach(() => {
  window.localStorage.clear();
});

describe('存档系统', () => {
  it('默认档与 roundtrip', () => {
    const data = defaultSave();
    const json = exportSave(data);
    const back = importSave(json);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.stardust).toBe(data.stardust);
    expect(back.collection).toEqual(data.collection);
  });

  it('损坏 JSON 回退默认档且不抛错', () => {
    expect(parseSave('{{{not-json')).toEqual(defaultSave());
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('42')).toEqual(defaultSave());
  });

  it('字段非法时防御性修补（负星屑/坏集合）', () => {
    const raw = JSON.stringify({
      version: 1, stardust: -5, totalDraws: 'x',
      collection: { 'major-0': { count: 2, firstAt: 1, lastAt: 2 }, bad: null },
      settings: { master: 9, bgm: 'NaN!' },
    });
    const data = parseSave(raw);
    expect(data.stardust).toBe(0);
    expect(data.totalDraws).toBe(0);
    expect(Object.keys(data.collection)).toEqual(['major-0']);
    expect(data.settings.master).toBe(1); // 超范围值钳制到 1
    expect(data.settings.bgm).toBe(0.5); // 非数值回落默认
  });

  it('v0 旧档迁移到 v1', () => {
    const v0 = JSON.stringify({ stardust: 120, collection: { 'minor-wands-1': { count: 1, firstAt: 9, lastAt: 9 } } });
    const data = parseSave(v0);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.stardust).toBe(120);
    expect(data.collection['minor-wands-1'].count).toBe(1);
    expect(data.settings.apiKey).toBe('');
  });

  it('persist + load roundtrip', () => {
    const data = defaultSave();
    data.stardust = 95;
    persistSave(data);
    expect(window.localStorage.getItem(SAVE_KEY)).toBeTruthy();
    const loaded = loadSave();
    expect(loaded.stardust).toBe(95);
  });
});

describe('游戏仓库（集成）', () => {
  it('初始化与启封：扣资源、写图鉴、保底计数', () => {
    const g = useGame;
    g.getState().resetSave();
    g.getState().init();
    const before = g.getState();
    expect(before.stardust).toBe(ECONOMY.startingStardust);

    const r1 = g.getState().unseal();
    expect(r1).not.toBeNull();
    expect(r1!.isNew).toBe(true);
    expect(g.getState().stardust).toBe(ECONOMY.startingStardust - ECONOMY.unsealCost);
    expect(g.getState().totalDraws).toBe(1);
    expect(g.getState().sinceLastNew).toBe(0);
    expect(Object.keys(g.getState().collection)).toContain(r1!.card.id);

    // 资源不足时拒绝
    g.setState({ stardust: 0 });
    expect(g.getState().unseal()).toBeNull();
  });

  it('观星结算入账', () => {
    const g = useGame;
    g.getState().resetSave();
    g.getState().init();
    g.getState().finishStarCatch({ stardust: 25, stars: 10, golds: 1, total: 11 });
    expect(g.getState().stardust).toBe(ECONOMY.startingStardust + 25);
    expect(g.getState().stats.gamesPlayed).toBe(1);
    expect(g.getState().stats.bestRound).toBe(11);
  });

  it('导入导出还原状态', () => {
    const g = useGame;
    g.getState().resetSave();
    g.getState().init();
    g.getState().finishStarCatch({ stardust: 10, stars: 5, golds: 0, total: 5 });
    const json = g.getState().exportSaveJson();
    g.getState().resetSave();
    expect(g.getState().stardust).toBe(ECONOMY.startingStardust);
    expect(g.getState().importSaveJson(json)).toBe(true);
    expect(g.getState().stardust).toBe(ECONOMY.startingStardust + 10);
  });
});
