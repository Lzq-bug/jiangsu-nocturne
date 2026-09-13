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
  const rngRef = useRef(mulberry32(1));
  const [caughtIds, setCaughtIds] = useState<Set<number>>(new Set());

  useEffect(() => () => window.cancelAnimationFrame(rafRef.current), []);

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

  function loop() {
    const round = roundRef.current;
    if (!round) return;
    const rng = rngRef.current;

    const step = () => {
      const now = performance.now();
      if (isRoundOver(round, now)) return end();

      // 生成
      const visible = round.stars.length;
      if (visible < STAR_CATCH.maxOnScreen && rng() < 0.5) {
        spawnStar(round, rng, now);
      }
      tick(round, now);

      // 写位置
      for (const s of round.stars) {
        const el = elMap.current.get(s.id);
        if (!el) continue;
        const { x, y } = starPos(s, now);
        el.style.transform = `translate(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%) translate(-50%,-50%)`;
        el.style.left = '0';
        el.style.top = '0';
      }

      setHud((h) => ({ ...h, time: remainingSec(round, now), score: round.caught.stars + round.caught.golds }));
      rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  }

  function end() {
    window.cancelAnimationFrame(rafRef.current);
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
            <span>⏱ {hud.time}s</span>
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
