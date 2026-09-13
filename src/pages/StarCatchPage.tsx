import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { audio } from '@/audio/AudioService';
import { useGame } from '@/game/store';
import { STAR_CATCH } from '@/game/economy';
import { mulberry32 } from '@/game/rng';
import {
  catchStar, createRound, isRoundOver, remainingSec, settle, spawnStar, starPos, tick,
  type RoundState,
} from '@/game/minigame/starcatch';

interface Pop { id: string; x: number; y: number; gold: boolean; born: number }

/**
 * 观星台 ·「捕星」
 * 星星是真实的 <button>（可点击、可聚焦）；位置经 rAF 直接写 transform，不走 React 重渲染。
 * reducedMotion 时切换为「静立星阵」：星星原地出现，逐个点亮，键盘可玩。
 */
export default function StarCatchPage() {
  const finish = useGame((s) => s.finishStarCatch);
  const best = useGame((s) => s.stats.bestRound);
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [hud, setHud] = useState<{ time: number; score: number }>({ time: STAR_CATCH.durationSec, score: 0 });
  const [result, setResult] = useState<{ stardust: number; stars: number; golds: number; total: number } | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);

  const skyRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef<RoundState | null>(null);
  const elMap = useRef(new Map<number, HTMLButtonElement>());
  const rafRef = useRef(0);
  const heartbeatRef = useRef(0);
  const rngRef = useRef(mulberry32(1));
  const [caughtIds, setCaughtIds] = useState<Set<number>>(new Set());

  useEffect(() => () => {
    window.cancelAnimationFrame(rafRef.current);
    window.clearInterval(heartbeatRef.current);
  }, []);

  function start() {
    rngRef.current = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
    roundRef.current = createRound(performance.now());
    setPops([]);
    setResult(null);
    setCaughtIds(new Set());
    setPhase('playing');
    setHud({ time: STAR_CATCH.durationSec, score: 0 });
    audio.play('click');
    loop();
  }

  /** 模拟推进（生成/过期/结束判定/HUD）——独立于渲染，后台标签页也能正确结算 */
  function simulate(): boolean {
    const round = roundRef.current;
    if (!round) return false;
    const now = performance.now();
    if (isRoundOver(round, now)) {
      end();
      return false;
    }
    const rng = rngRef.current;
    if (round.stars.length < STAR_CATCH.maxOnScreen && rng() < 0.5) {
      spawnStar(round, rng, now);
    }
    tick(round, now);
    setHud({ time: remainingSec(round, now), score: round.caught.stars + round.caught.golds });
    return true;
  }

  /** 渲染推进（写星星位置）——仅前台 rAF；reducedMotion 时用静立星阵 */
  function renderPositions() {
    const round = roundRef.current;
    const host = skyRef.current;
    if (!round || !host) return;
    const now = performance.now();
    const staticMode = useGame.getState().settings.reducedMotion;
    // 像素位移（相对天幕实际尺寸）：
    // 不能用百分比——translate 的百分比相对元素自身宽高，会让星星全部堆在左上角。
    const w = host.clientWidth;
    const h = host.clientHeight;
    for (const s of round.stars) {
      const el = elMap.current.get(s.id);
      if (!el) continue;
      const pos = staticMode
        ? { x: (10 + ((s.id * 37) % 80)) / 100, y: (12 + ((s.id * 53) % 64)) / 100 }
        : starPos(s, now);
      el.style.left = '0';
      el.style.top = '0';
      el.style.transform = `translate(${(pos.x * w).toFixed(1)}px, ${(pos.y * h).toFixed(1)}px)`;
    }
  }

  function loop() {
    window.clearInterval(heartbeatRef.current);
    // 心跳兜底：rAF 被暂停（切标签页/省电）时仍保证计时与结算正确
    heartbeatRef.current = window.setInterval(() => {
      if (simulate()) renderPositions();
    }, 300);
    const step = () => {
      if (!simulate()) return;
      renderPositions();
      rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  }

  function end() {
    window.cancelAnimationFrame(rafRef.current);
    window.clearInterval(heartbeatRef.current);
    const round = roundRef.current;
    if (!round) return;
    const r = settle(round);
    setResult(r);
    finish(r);
    setPhase('done');
    audio.play('settle');
  }

  function onCatch(id: number, kind: 0 | 1, x: number, y: number) {
    const round = roundRef.current;
    if (!round || phase !== 'playing') return;
    if (catchStar(round, id, performance.now())) {
      setCaughtIds((prev) => new Set(prev).add(id));
      audio.play(kind === 1 ? 'gold' : 'catch');
      const key = `${id}-${performance.now()}`;
      setPops((p) => [...p.slice(-6), { id: key, x, y, gold: kind === 1, born: Date.now() }]);
      window.setTimeout(() => setPops((p) => p.filter((q) => q.id !== key)), 700);
    }
  }

  return (
    <div className="fade-in">
      <div className="panel-title">观星台 · 捕星</div>
      <p style={{ color: 'var(--text-mid)', fontSize: 13.5, marginTop: 0 }}>
        星屑星 <b style={{ color: 'var(--moonlight)' }}>+2</b> · 金星 <b style={{ color: 'var(--gold)' }}>+6</b>
        {' · '}一局捕满 {STAR_CATCH.bonusThreshold} 颗另有 <b style={{ color: 'var(--gold)' }}>+{STAR_CATCH.bonusStardust}</b> 加成
        {' · '}历史最佳 {best}
      </p>

      <div
        className="sky"
        ref={skyRef}
        role="application"
        aria-label="观星夜幕：点击漂过的星星"
      >
        {phase === 'playing' && (
          <div className="sky-hud">
            <span>剩余 {hud.time}s</span>
            <span>✦ {hud.score}</span>
          </div>
        )}

        {phase === 'playing' && roundRef.current?.stars
          .filter((s) => !caughtIds.has(s.id))
          .map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              if (el) elMap.current.set(s.id, el);
              else elMap.current.delete(s.id);
            }}
            className={`sky-star${s.kind === 1 ? ' gold' : ''}`}
            style={{ transform: 'translate(-100px,-100px)' }}
            aria-label={s.kind === 1 ? '捕获金星' : '捕获星屑星'}
            onPointerDown={(e) => {
              e.preventDefault();
              const rect = skyRef.current?.getBoundingClientRect();
              const x = rect ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
              const y = rect ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
              onCatch(s.id, s.kind, x, y);
            }}
          >
            <span className="core" aria-hidden="true" />
          </button>
        ))}

        {pops.map((p) => (
          <span key={p.id} className={`catch-pop${p.gold ? ' gold' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            +{p.gold ? STAR_CATCH.goldValue : STAR_CATCH.starValue}
          </span>
        ))}

        {phase !== 'playing' && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center' }}>
              {phase === 'idle' ? (
                <>
                  <div style={{ fontSize: 40 }} aria-hidden="true">🔭</div>
                  <p style={{ color: 'var(--text-mid)', margin: 0, fontSize: 13.5 }}>
                    今晚天色清澈。星屑星与金星会自天幕漂过——<br />在它们熄灭前点住它们。
                  </p>
                  <button className="btn btn-primary" onClick={start}>开始观星（{STAR_CATCH.durationSec} 秒）</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 34 }} aria-hidden="true">🧺</div>
                  <p style={{ margin: 0, fontSize: 15 }}>
                    星屑 <b style={{ color: 'var(--moonlight)' }}>{result?.stars}</b> ·
                    金星 <b style={{ color: 'var(--gold)' }}>{result?.golds}</b>
                    {' '}→ 结算 <b style={{ color: 'var(--cyan)' }}>+{result?.stardust}</b> 星屑
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button className="btn" onClick={start}>再来一局</button>
                    <button className="btn btn-primary" onClick={() => { audio.play('click'); navigate('/unseal'); }}>去启封 →</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
