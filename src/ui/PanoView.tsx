/**
 * PanoView · 360° 全景夜游查看器（VR 效果·场景层）
 * 把景点全景画幅贴在 CSS 3D 圆柱内壁上，拖动/自动环游/陀螺仪改变视角，
 * 实现免插件的 Web 全景环顾。未启封的卡以虚化锁定态展示。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardData } from '@/tarot/types';
import { SUIT_ZH } from '@/tarot/types';
import { nightPanoFor } from './nightArt';

const SLICES = 18;
const SLICE_W = 132;
const RADIUS = Math.round(SLICE_W / 2 / Math.tan(Math.PI / SLICES));
const DEG_PER_PX = 360 / (SLICES * SLICE_W);

export interface PanoViewProps {
  card: CardData;
  /** 未启封：虚化锁定 */
  locked?: boolean;
  /** 紧凑内嵌模式（详情页），false 时占满父容器 */
  compact?: boolean;
}

export function PanoView({ card, locked = false, compact = true }: PanoViewProps) {
  const panoURI = useMemo(() => nightPanoFor(card), [card]);
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const state = useRef({ yaw: 0, pitch: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, auto: true, raf: 0 });
  const [auto, setAuto] = useState(true);
  const [gyro, setGyro] = useState(false);
  const [hint, setHint] = useState(true);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const isTouch = useMemo(() => typeof window !== 'undefined' && 'ontouchstart' in window, []);

  // 渲染循环：惯性 + 自动环游
  useEffect(() => {
    if (reduced || locked) return;
    const tick = () => {
      const s = state.current;
      if (!s.dragging) {
        s.yaw += s.vy;
        s.vy *= 0.94;
        if (Math.abs(s.vy) < 0.001) s.vy = 0;
        if (s.auto && s.vy === 0) s.yaw += 0.032;
        if (s.yaw >= 360 || s.yaw <= -360) s.yaw = s.yaw % 360;
        if (worldRef.current) {
          worldRef.current.style.transform = `rotateX(${s.pitch.toFixed(2)}deg) rotateY(${s.yaw.toFixed(2)}deg)`;
        }
      }
      s.raf = requestAnimationFrame(tick);
    };
    state.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(state.current.raf);
  }, [reduced, locked]);

  // 陀螺仪
  useEffect(() => {
    if (!gyro) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const s = state.current;
      const g = e.gamma ?? 0;
      const b = e.beta ?? 45;
      s.yaw = -g * 1.4;
      s.pitch = Math.max(-10, Math.min(10, (b - 48) * -0.25));
      if (worldRef.current) {
        worldRef.current.style.transform = `rotateX(${s.pitch.toFixed(2)}deg) rotateY(${s.yaw.toFixed(2)}deg)`;
      }
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [gyro]);

  async function toggleGyro() {
    if (gyro) { setGyro(false); return; }
    const doe = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (doe && typeof doe.requestPermission === 'function') {
      try {
        const res = await doe.requestPermission();
        if (res !== 'granted') return;
      } catch { return; }
    }
    state.current.auto = false;
    setAuto(false);
    setGyro(true);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (locked) return;
    const s = state.current;
    s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY; s.vy = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    stageRef.current?.classList.add('grabbing');
    setHint(false);
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = state.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    s.lastX = e.clientX; s.lastY = e.clientY;
    s.vy = dx * DEG_PER_PX;
    s.yaw += s.vy;
    s.pitch = Math.max(-10, Math.min(10, s.pitch - dy * 0.06));
    if (worldRef.current) {
      worldRef.current.style.transform = `rotateX(${s.pitch.toFixed(2)}deg) rotateY(${s.yaw.toFixed(2)}deg)`;
    }
  }
  function onPointerUp() {
    const s = state.current;
    s.dragging = false;
    stageRef.current?.classList.remove('grabbing');
  }

  function fullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  const seriesLabel = card.arcana === 'major' ? '城章' : `夜签 · ${SUIT_ZH[card.suit]}`;

  return (
    <div
      ref={stageRef}
      className={`pano-stage${compact ? ' compact' : ''}${locked ? ' locked' : ''}`}
      role="img"
      aria-label={`${card.city} ${card.nameZh} 全景夜游`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={worldRef} className="pano-world" style={locked ? undefined : { transform: 'rotateX(0deg) rotateY(0deg)' }}>
        {Array.from({ length: SLICES }, (_, i) => (
          <div
            key={i}
            className="pano-slice"
            style={{
              width: SLICE_W,
              marginLeft: -SLICE_W / 2,
              transform: `rotateY(${(i * 360) / SLICES}deg) translateZ(-${RADIUS}px)`,
              backgroundImage: `url("${panoURI}")`,
              backgroundSize: `${SLICES * SLICE_W}px 100%`,
              backgroundPosition: `${-i * SLICE_W}px center`,
            }}
          />
        ))}
      </div>

      <div className="pano-vignette" aria-hidden="true" />

      {/* HUD */}
      <div className="pano-hud">
        <div className="pano-title">
          <b>{card.nameZh}</b>
          <span>{card.city} · {seriesLabel}</span>
        </div>
        {!locked && (
          <div className="pano-tools">
            {!reduced && (
              <button
                className="pano-btn"
                aria-pressed={auto}
                title="自动环游"
                onClick={() => { state.current.auto = !auto; setAuto(!auto); }}
              >{auto ? '⏸ 环游' : '▶ 环游'}</button>
            )}
            {isTouch && <button className="pano-btn" aria-pressed={gyro} onClick={() => void toggleGyro()}>☰ 陀螺仪</button>}
            <button className="pano-btn" onClick={fullscreen}>⛶ 全景</button>
          </div>
        )}
      </div>

      {locked ? (
        <div className="pano-lock">
          <span className="pano-lock-seal" aria-hidden="true">封</span>
          <p>尚未启封这一帧夜色<br /><small>去观星台攒星屑，启封后即可 360° 夜游</small></p>
        </div>
      ) : (
        hint && <div className="pano-hint">按住拖动 · 环顾四周</div>
      )}
    </div>
  );
}
