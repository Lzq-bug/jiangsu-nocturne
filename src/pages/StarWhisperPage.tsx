import { useState } from 'react';
import { audio } from '@/audio/AudioService';
import { useGame } from '@/game/store';
import { createRng } from '@/game/rng';
import { rollDraw } from '@/game/draw';
import { ALL_CARDS, getCardById, isMajor } from '@/tarot/data';
import { localReading, whisperWithAI } from '@/services/ai/oracle';
import { CardArt } from '@/ui/CardArt';

interface Turn {
  role: 'user' | 'oracle';
  text: string;
  cards?: string[];
}

/**
 * 星语占卜（完全可选）
 * - 抽牌由引擎完成（免费指引，不消耗星屑、不写入图鉴，避免刷取漏洞）
 * - 无 AI Key：本地牌义解读；有 Key：调用 DeepSeek 兼容接口增强
 */
export default function StarWhisperPage() {
  const settings = useGame((s) => s.settings);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking'>('idle');
  const [error, setError] = useState('');

  async function ask() {
    const q = input.trim();
    if (!q || status === 'thinking') return;
    setError('');
    setInput('');
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setStatus('thinking');

    // 引擎抽三张（结果先定，展示在后）
    const { rng } = createRng();
    const drawn = [0, 1, 2].map(() => rollDraw(rng, { owned: new Set(), sinceLastNew: 0 }).card.id);
    const cards = drawn.map((id) => getCardById(id)!).filter(Boolean);

    setTurns((t) => [...t, { role: 'oracle', text: '', cards: drawn }]);

    let reading: string;
    if (settings.apiKey.trim()) {
      try {
        reading = await whisperWithAI({
          question: q, cards, apiKey: settings.apiKey,
          baseUrl: settings.apiBaseUrl, modelId: settings.modelId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        reading = localReading(q, cards) + '\n（AI 增强失败，以上为本地星语。）';
      }
    } else {
      // 模拟一点思考停顿，让仪式感成立
      await new Promise((r) => setTimeout(r, 900));
      reading = localReading(q, cards);
    }

    audio.play('reveal');
    setTurns((t) => {
      const next = [...t];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'oracle') {
          next[i] = { ...next[i], text: reading };
          break;
        }
      }
      return next;
    });
    setStatus('idle');
  }

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="panel-title">星语 · 向魔女请教</div>
      <p style={{ color: 'var(--text-mid)', fontSize: 13, margin: '4px 0 12px' }}>
        每次提问会免费抽出三张指引之牌（不计入魔女阁收藏、不消耗星屑）。
        {settings.apiKey.trim()
          ? '已启用 AI 增强——魔女会结合你的困惑私语。'
          : '未配置 AI，将使用本地牌义解读；可在设置页启用 AI 增强（完全可选）。'}
      </p>

      {turns.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden="true">🌙</div>
          <p style={{ color: 'var(--text-mid)', fontSize: 13.5, lineHeight: 2, margin: 0 }}>
            把困惑写在下面——魔女会为你抽三张牌，<br />在牌面的缝隙里找一句回给你的话。
          </p>
        </div>
      )}

      <div className="whisper-log" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i}>
            <div className={`whisper-msg ${t.role}`}>{t.text}</div>
            {t.cards && (
              <div style={{ display: 'flex', gap: 10, margin: '10px 0 4px', justifyContent: 'flex-start' }}>
                {t.cards.map((id) => {
                  const c = getCardById(id);
                  if (!c) return null;
                  return (
                    <div key={id} style={{ width: 74, display: 'grid', gap: 4, justifyItems: 'center' }}>
                      <CardArt card={c} style={{ width: '100%' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-mid)' }}>{c.nameZh}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {t.role === 'oracle' && !t.text && (
              <div className="whisper-status" style={{ margin: '8px 0' }}>
                {status === 'thinking' ? '魔女正在翻阅手记……' : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p style={{ color: 'var(--wax, #c2453a)', fontSize: 12 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void ask(); }}
          placeholder="写下你的困惑……（最多 120 字）"
          maxLength={120}
          aria-label="困惑"
          style={{
            flex: 1, padding: '11px 14px', borderRadius: 10,
            border: '1px solid var(--line)', background: 'rgba(13,18,38,0.6)',
            color: 'var(--text-hi)', fontFamily: 'var(--font-serif)', fontSize: 14,
          }}
        />
        <button className="btn btn-primary" onClick={() => void ask()} disabled={status === 'thinking' || !input.trim()}>
          {status === 'thinking' ? '……' : '求签'}
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-low)', marginTop: 10 }}>
        共 {ALL_CARDS.length} 张牌均可被抽为指引；{isMajor(ALL_CARDS[0]) ? '月章与星签按同一权重池轮转。' : ''}
      </p>
    </div>
  );
}
