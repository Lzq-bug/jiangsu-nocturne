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

/** 重点卡牌：嵌入完整的独立 3D 场景（自带机位解说/热点导航/交互） */
const EMBEDS: Record<string, string> = {
  'major-0': '/pano/fuzimiao.html', // 夫子庙·秦淮画舫——秦淮画廊 3D 全景
  'major-2': '/pano/zhuozheng.html', // 拙政园·拙政问雅——拙政问雅 3D 夜景
  'major-3': '/pano/pingjianglu.html', // 平江路·灯河夜巷——灯河夜巷 3D 全景
  'major-7': '/pano/dongguan.html', // 东关街·灯火长街——灯火长街 3D 夜景
  'major-4': '/pano/jinjihu.html', // 金鸡湖·东方之门——湖光门影 3D 夜景
  'major-5': '/pano/hanshan.html', // 寒山寺·枫桥夜泊——全功能枫桥夜泊 3D 场景
  'major-6': '/pano/shouxihu.html', // 瘦西湖·五亭桥月——五亭桥月 3D 夜景
  'major-8': '/pano/qingmingqiao.html', // 清名桥·运河灯河——运河灯河 3D 夜景
  'major-9': '/pano/taihu.html', // 鼋头渚·太湖灯塔——太湖灯塔 3D 全景
  'minor-pentacles-1': '/pano/taicheng.html', // 台城明城墙——湖山入城 3D 夜景
  'minor-pentacles-4': '/pano/panmen.html', // 盘门三景——运河夜阑 3D 夜景
  'minor-pentacles-3': '/pano/chaotian.html', // 朝天宫——金陵文庙 3D 夜景
  'minor-pentacles-10': '/pano/erfenmingyue.html', // 二分明月楼——一园明月 3D 夜景
  'minor-pentacles-11': '/pano/wangshiyuan.html', // 网师园——网师夜花园 3D 全景
  'minor-pentacles-13': '/pano/zhenhuailou.html', // 镇淮楼——谯楼更鼓 3D 夜景
  'minor-pentacles-14': '/pano/anfeng.html', // 安丰古镇——串场河夜潮 3D 全景
};

const EMBED_LABELS: Record<string, string> = {
  'major-0': '3D 建模 · 秦淮画廊',
  'major-2': '3D 建模 · 拙政问雅',
  'major-3': '3D 建模 · 灯河夜巷',
  'major-7': '3D 建模 · 灯火长街',
  'major-4': '3D 建模 · 湖光门影',
  'major-5': '3D 建模 · 枫桥夜泊',
  'major-6': '3D 建模 · 五亭桥月',
  'major-8': '3D 建模 · 运河灯河',
  'major-9': '3D 建模 · 太湖灯塔',
  'minor-pentacles-1': '3D 建模 · 湖山入城',
  'minor-pentacles-4': '3D 建模 · 运河夜阑',
  'minor-pentacles-3': '3D 建模 · 金陵文庙',
  'minor-pentacles-10': '3D 建模 · 一园明月',
  'minor-pentacles-11': '3D 建模 · 夜花园',
  'minor-pentacles-13': '3D 建模 · 谯楼更鼓',
  'minor-pentacles-14': '3D 建模 · 串场河夜潮',
};

export function PanoView({ card, locked = false, compact = true }: PanoViewProps) {
  const embed = EMBEDS[card.id];
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
    if (embed) return; // 嵌入场景自带渲染,无需微城

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
      {embed ? (
        <iframe
          className="pano-iframe"
          src={embed}
          title={`${card.nameZh} 3D 全景夜游`}
          allow="fullscreen"
        />
      ) : (
        <div className="pano-vignette" aria-hidden="true" />
      )}

      {!locked && (
        <span className="pano-badge" aria-hidden="true">
          {embed ? (EMBED_LABELS[card.id] ?? '3D 建模 · 全景夜游') : '3D 建模 · 夜游'}
        </span>
      )}

      {/* HUD（嵌入场景自带交互界面,只保留标题与全屏入口） */}
      <div className="pano-hud">
        <div className="pano-title">
          <b>{card.nameZh}</b>
          <span>{card.city} · {seriesLabel}</span>
        </div>
        {!locked && !embed && (
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
        {!locked && embed && (
          <div className="pano-tools">
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
        !embed && hint && <div className="pano-hint">按住拖动 · 环顾四周</div>
      )}
    </div>
  );
}
