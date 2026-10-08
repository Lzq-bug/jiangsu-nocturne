/**
 * VrCard · 真 3D 视差卡牌容器（VR 效果·卡面层）
 * 四层空间：投影层(-70px) / 光晕层(-46px) / 卡面层(0) / 眩光层(+34px)。
 * 桌面：指针移动产生倾斜与跟随眩光；移动端：陀螺仪倾斜设备产生同样效果
 * （iOS 需在首次触碰卡牌时授权一次）。尊重 prefers-reduced-motion 与 disabled。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface VrCardProps {
  children: ReactNode;
  /** 光晕主色（通常传卡牌 accent） */
  accent: string;
  className?: string;
  style?: CSSProperties;
  /** 最大倾角（度） */
  maxTilt?: number;
  /** 关闭视差（尊重减少动效设置 / 翻面期间） */
  disabled?: boolean;
  ariaLabel?: string;
}

export function VrCard({ children, accent, className, style, maxTilt = 9, disabled, ariaLabel }: VrCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, on: false });
  const gyroRef = useRef({ asked: false, active: false, neutral: null as null | { g: number; b: number } });
  const active = !disabled;

  // 移动端：陀螺仪驱动倾斜（首次读到作为中立位，避免跳变）
  useEffect(() => {
    if (!active) return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (!coarse) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const gyro = gyroRef.current;
      if (!gyro.active) return;
      const g = e.gamma ?? 0;
      const b = e.beta ?? 45;
      if (!gyro.neutral) gyro.neutral = { g, b };
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      setTilt({
        x: clamp((gyro.neutral.b - b) / 30) * maxTilt,
        y: clamp((g - gyro.neutral.g) / 30) * maxTilt,
      });
      const gx = 50 + clamp((g - gyro.neutral.g) / 30) * 42;
      const gy = 50 - clamp((gyro.neutral.b - b) / 30) * 42;
      setGlare({ x: Math.max(4, Math.min(96, gx)), y: Math.max(4, Math.min(96, gy)), on: true });
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [active, maxTilt]);

  function onMove(e: React.PointerEvent) {
    if (!active || !ref.current || gyroRef.current.active) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - py) * maxTilt * 2, y: (px - 0.5) * maxTilt * 2 });
    setGlare({ x: px * 100, y: py * 100, on: true });
  }

  function onLeave() {
    if (gyroRef.current.active) return;
    setTilt({ x: 0, y: 0 });
    setGlare((g) => ({ ...g, on: false }));
  }

  // iOS 陀螺仪授权：首次触碰卡牌时尝试一次
  function onDown() {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    const gyro = gyroRef.current;
    if (gyro.asked || !DOE || typeof DOE.requestPermission !== 'function') return;
    gyro.asked = true;
    void DOE.requestPermission().then((res) => {
      if (res === 'granted') gyro.active = true;
    }).catch(() => { /* 拒绝则继续用触摸视差 */ });
  }

  const shadowShift = `${(-tilt.y * 1.6).toFixed(1)}px ${(10 + Math.abs(tilt.x) * 0.8).toFixed(1)}px`;

  return (
    <div
      ref={ref}
      className={`vr-scene${className ? ` ${className}` : ''}`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
      aria-label={ariaLabel}
    >
      <div
        className="vr-body"
        style={{ transform: `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)` }}
      >
        {/* 投影层（最深，随倾斜反向位移） */}
        <div
          className="vr-shadow"
          aria-hidden="true"
          style={{
            transform: `translate3d(${shadowShift}, 0, -70px) scale(1.06)`,
            opacity: glare.on ? 0.75 : 0.55,
          }}
        />
        {/* 背景光晕层 */}
        <div
          className="vr-aura"
          aria-hidden="true"
          style={{
            background: `radial-gradient(closest-side, ${accent}42, transparent 72%)`,
            transform: `translate3d(${(tilt.y * -1.2).toFixed(1)}px, ${(tilt.x * 1.2).toFixed(1)}px, -46px) scale(1.22)`,
            opacity: glare.on ? 0.95 : 0.55,
          }}
        />
        {/* 卡面层 */}
        <div className="vr-face">{children}</div>
        {/* 眩光层（最近，跟随指针/倾角） */}
        <div
          className="vr-glare"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,244,214,0.22), transparent 46%)`,
            opacity: glare.on ? 1 : 0,
            transform: 'translateZ(34px)',
          }}
        />
      </div>
    </div>
  );
}
