import { useRef, useState } from 'react';
import { useGame } from '@/game/store';
import { audio } from '@/audio/AudioService';
import { web3Capability } from '@/services/capabilities';

export default function SettingsPage() {
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  const exportJson = useGame((s) => s.exportSaveJson);
  const importJson = useGame((s) => s.importSaveJson);
  const reset = useGame((s) => s.resetSave);

  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 2600);
  }

  function doExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veiled-moon-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('存档已导出为 JSON 文件。');
  }

  async function doImport(file: File) {
    try {
      const text = await file.text();
      flash(importJson(text) ? '存档导入成功。' : '存档格式无法识别（version 不符或内容损坏）。');
    } catch {
      flash('读取文件失败。');
    }
  }

  return (
    <div className="settings-grid fade-in">
      <div>
        <div className="panel-title">声音</div>
        <div className="range-row">
          <span id="vol-master">主音量</span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.master}
            aria-labelledby="vol-master"
            onChange={(e) => { update({ master: Number(e.target.value) }); audio.setVolumes({ master: Number(e.target.value) }); }}
          />
          <output>{Math.round(settings.master * 100)}</output>
        </div>
        <div className="range-row">
          <span id="vol-bgm">氛围音</span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.bgm}
            aria-labelledby="vol-bgm"
            onChange={(e) => { update({ bgm: Number(e.target.value) }); audio.setVolumes({ bgm: Number(e.target.value) }); }}
          />
          <output>{Math.round(settings.bgm * 100)}</output>
        </div>
        <div className="range-row">
          <span id="vol-sfx">音效</span>
          <input
            type="range" min={0} max={1} step={0.05} value={settings.sfx}
            aria-labelledby="vol-sfx"
            onChange={(e) => { update({ sfx: Number(e.target.value) }); audio.setVolumes({ sfx: Number(e.target.value) }); audio.play('click'); }}
          />
          <output>{Math.round(settings.sfx * 100)}</output>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-mid)' }}>
          <input
            type="checkbox" checked={settings.muted}
            onChange={(e) => { update({ muted: e.target.checked }); audio.setVolumes({ muted: e.target.checked }); }}
          />
          全部静音
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-mid)', marginTop: 8 }}>
          <input
            type="checkbox" checked={settings.reducedMotion}
            onChange={(e) => update({ reducedMotion: e.target.checked })}
          />
          减少动效（观星台将使用静立星阵）
        </label>
      </div>

      <div>
        <div className="panel-title">星语 AI（可选）</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 12.5, lineHeight: 1.9, margin: '0 0 12px' }}>
          核心游戏完全不依赖 AI。配置 DeepSeek 兼容接口后，「星语」页可获得个性化解读。
          Key 仅保存在本机浏览器（localStorage），不会上传到任何第三方。
        </p>
        <div className="field">
          <label htmlFor="cfg-key">API Key（DeepSeek 兼容，sk-…）</label>
          <input
            id="cfg-key" type="password" autoComplete="off"
            value={settings.apiKey}
            placeholder="留空 = 使用本地星语"
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cfg-url">API 地址</label>
          <input
            id="cfg-url" type="text" value={settings.apiBaseUrl}
            onChange={(e) => update({ apiBaseUrl: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cfg-model">模型</label>
          <input
            id="cfg-model" type="text" value={settings.modelId}
            onChange={(e) => update({ modelId: e.target.value })}
          />
        </div>
      </div>

      <div>
        <div className="panel-title">链上收藏（实验性 · 可选）</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 12.5, lineHeight: 1.9, margin: 0 }}>
          {web3Capability.reason}
        </p>
      </div>

      <div>
        <div className="panel-title">存档</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 12.5, margin: '0 0 12px' }}>
          存档自动保存在本机浏览器（含图鉴、星屑、设置）。换设备或清理浏览器前，建议先导出。
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={doExport}>导出存档</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>导入存档</button>
          <input
            ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }}
            aria-hidden="true" tabIndex={-1}
          />
          {!confirmReset ? (
            <button className="btn" style={{ color: '#c2453a', borderColor: 'rgba(194,69,58,0.4)' }} onClick={() => setConfirmReset(true)}>
              重置存档…
            </button>
          ) : (
            <>
              <button
                className="btn" style={{ color: '#c2453a', borderColor: 'rgba(194,69,58,0.6)' }}
                onClick={() => { reset(); setConfirmReset(false); flash('存档已重置为全新手记。'); }}
              >
                确认清空全部进度
              </button>
              <button className="btn" onClick={() => setConfirmReset(false)}>取消</button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" style={{ color: 'var(--cyan)', fontSize: 13, margin: 0 }}>{msg}</p>
      )}
    </div>
  );
}
