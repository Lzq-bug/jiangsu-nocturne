/**
 * VrCard · 3D 视差卡牌容器（VR 效果·卡面层）
 * 指针/触摸移动时整卡产生带景深的倾斜：背后光晕层、卡面层、前方眩光层
 * 处于不同 translateZ，形成真实的空间视差；支持触摸与 prefers-reduced-motion。
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface VrCardProps {
  children: ReactNode;
  /** 光晕主色（通常传卡牌 accent） */
  accent: string;
  className?: string;
  style?: CSSProperties;
  /** 最大倾角（度） */
  maxTilt?: number;
  /** 关闭视差（尊重减少动效设置） */
  disabled?: boolean;
  ariaLabel?: string;
}

export function VrCard({ children, accent, className, style, maxTilt = 9, disabled, ariaLabel }: VrCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, on: false });
  const active = !disabled;

  function onMove(e: React.PointerEvent) {
    if (!active || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - py) * maxTilt * 2, y: (px - 0.5) * maxTilt * 2 });
    setGlare({ x: px * 100, y: py * 100, on: true });
  }

  function onLeave() {
    setTilt({ x: 0, y: 0 });
    setGlare((g) => ({ ...g, on: false }));
  }

  return (
    <div
      ref={ref}
      className={`vr-scene${className ? ` ${className}` : ''}`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      aria-label={ariaLabel}
    >
      <div
        className="vr-body"
        style={{
          transform: `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`,
        }}
      >
        {/* 背景光晕层（远） */}
        <div
          className="vr-aura"
          aria-hidden="true"
          style={{
            background: `radial-gradient(closest-side, ${accent}42, transparent 72%)`,
            transform: 'translateZ(-46px) scale(1.22)',
            opacity: glare.on ? 0.95 : 0.55,
          }}
        />
        {/* 卡面层（中） */}
        <div className="vr-face">{children}</div>
        {/* 眩光层（近，跟随指针） */}
        <div
          className="vr-glare"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,244,214,0.20), transparent 46%)`,
            opacity: glare.on ? 1 : 0,
            transform: 'translateZ(34px)',
          }}
        />
      </div>
    </div>
  );
}
