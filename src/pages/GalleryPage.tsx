import { useState } from 'react';
import { MAJORS } from '@/tarot/data/majors';
import { isMajor } from '@/tarot/data';
import { CardArt } from '@/ui/CardArt';
import { VrCard } from '@/ui/VrCard';
import { PanoView } from '@/ui/PanoView';

/**
 * 夜泊画廊 · 免费开放的城章夜景预览
 * 二十二张城章在此公开展出；点击任意一帧即可进入 360° 全景夜游。
 * （夜签仍需在游戏中启封收集——给收藏留一点盼头。）
 */
export default function GalleryPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = MAJORS.find((m) => m.id === openId);

  return (
    <div className="fade-in">
      <div className="gallery-intro">
        <div className="panel-title">夜泊画廊 · 二十二城章</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 13, margin: 0, lineHeight: 1.9 }}>
          江苏之夜，先睹为快——城章收录全省最具代表性的二十二处夜景地标。
          点触任意一帧，即刻进入 <b style={{ color: 'var(--gold)' }}>360° 全景夜游</b>；
          拖动环顾，或用手机陀螺仪左右环视。其余五十六帧夜签，等你在夜泊阁亲手启封。
        </p>
      </div>

      <div className="gallery-grid">
        {MAJORS.map((c) => (
          <button
            key={c.id}
            className="gallery-item"
            onClick={() => setOpenId(c.id)}
            aria-label={`夜游 ${c.city} ${c.nameZh}`}
          >
            <VrCard accent={c.accent} ariaLabel={`${c.city} ${c.nameZh}`}>
              {isMajor(c) ? <CardArt card={c} style={{ width: '100%' }} /> : null}
            </VrCard>
            <span className="g-name">{c.nameZh}</span>
            <span className="g-city">{c.city}</span>
          </button>
        ))}
      </div>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(4, 6, 15, 0.88)', backdropFilter: 'blur(8px)',
            display: 'grid', placeItems: 'center', padding: '18px',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`${open.nameZh} 全景夜游`}
          onClick={() => setOpenId(null)}
        >
          <div style={{ width: 'min(1100px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
            <PanoView card={open} compact={false} />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <button className="btn" onClick={() => setOpenId(null)}>合上这一页夜景</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
