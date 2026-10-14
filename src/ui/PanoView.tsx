/**
 * PanoView · 360° 全景夜游查看器(Three.js 3D 建模场景)
 * 依据卡牌的景点母题与主光色,实时建模一座可环顾的夜景微城:
 * 建筑体块与地标构筑物、轮廓灯与灯笼、水面实时倒影、星空月色与雾气。
 * 透视相机立于场景中心,拖动/陀螺仪转动视角,惯性衰减,可自动环游与全屏。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CardData } from '@/tarot/types';
import { SUIT_ZH } from '@/tarot/types';
import { buildNightScene3D } from './scene3D';

export interface PanoViewProps {
  card: CardData;
  /** 未启封：虚化锁定 */
  locked?: boolean;
  /** 紧凑内嵌模式（详情页），false 时占满父容器 */
  compact?: boolean;
}

export function PanoView({ card, locked = false, compact = true }: PanoViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const state = useRef({ yaw: 0, pitch: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, auto: true, raf: 0 });
  const [auto, setAuto] = useState(true);
  const [gyro, setGyro] = useState(false);
  const [hint, setHint] = useState(true);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const isTouch = useMemo(() => typeof window !== 'undefined' && 'ontouchstart' in window, []);

  /* ---------- Three.js 场景 ---------- */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.domElement.className = 'pano-gl';
    stage.insertBefore(renderer.domElement, stage.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060a18');
    scene.fog = new THREE.FogExp2('#0a0f22', 0.012);
    const camera = new THREE.PerspectiveCamera(72, stage.clientWidth / stage.clientHeight, 0.1, 200);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, 1.7, 0);

    let scene3d: ReturnType<typeof buildNightScene3D> | null = null;
    try {
      scene3d = buildNightScene3D(card);
      scene.add(scene3d.group);
    } catch { /* 建模失败时保留星空底色场景 */ }

    const applyCam = () => {
      camera.rotation.y = state.current.yaw;
      camera.rotation.x = state.current.pitch;
    };
    applyCam();

    const onResize = () => {
      camera.aspect = stage.clientWidth / stage.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(stage.clientWidth, stage.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(stage);

    const tick = () => {
      const s = state.current;
      if (!s.dragging) {
        s.yaw += s.vy;
        s.vy *= 0.94;
        if (Math.abs(s.vy) < 0.0004) s.vy = 0;
        if (s.auto && s.vy === 0 && !gyroOn.current) s.yaw += 0.0011;
        applyCam();
      }
      renderer.render(scene, camera);
      s.raf = requestAnimationFrame(tick);
    };
    state.current.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(state.current.raf);
      ro.disconnect();
      scene3d?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  const gyroOn = useRef(false);

  // 陀螺仪
  useEffect(() => {
    if (!gyro) return;
    gyroOn.current = true;
    const onOrient = (e: DeviceOrientationEvent) => {
      const s = state.current;
      const g = e.gamma ?? 0;
      const b = e.beta ?? 45;
      s.yaw = (-g * 1.4 * Math.PI) / 180;
      s.pitch = Math.max(-0.45, Math.min(0.45, ((b - 48) * -0.25 * Math.PI) / 180));
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => { gyroOn.current = false; window.removeEventListener('deviceorientation', onOrient); };
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
    s.vy = dx * 0.0026;
    s.yaw += s.vy;
    s.pitch = Math.max(-0.45, Math.min(0.45, s.pitch - dy * 0.001));
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
      <div className="pano-vignette" aria-hidden="true" />

      {!locked && <span className="pano-badge" aria-hidden="true">3D 建模 · 夜游</span>}

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
