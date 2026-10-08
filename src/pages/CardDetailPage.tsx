import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGame } from '@/game/store';
import { getCardById, isMajor } from '@/tarot/data';
import { SUITS } from '@/tarot/data/minorSource';
import { CardArt, SealedCard } from '@/ui/CardArt';
import { VrCard } from '@/ui/VrCard';
import { PanoView } from '@/ui/PanoView';
import { RANK_ZH, SUIT_ZH } from '@/tarot/types';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const collection = useGame((s) => s.collection);
  const [flipped, setFlipped] = useState(false);
  const card = id ? getCardById(id) : undefined;
  const entry = card ? collection[card.id] : undefined;

  if (!card) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }} className="fade-in">
        <p style={{ color: 'var(--text-mid)' }}>这一页夜色不存在。</p>
        <Link to="/collection" className="btn">回到夜泊阁</Link>
      </div>
    );
  }

  const owned = Boolean(entry);
  const suitMeta = card.arcana === 'minor' ? SUITS.find((s) => s.key === card.suit) : undefined;
  const signIdx = card.note.lastIndexOf('——');
  const noteBody = signIdx > 0 ? card.note.slice(0, signIdx) : card.note;
  const noteSign = signIdx > 0 ? card.note.slice(signIdx + 2) : '夜航手记';

  return (
    <div className="fade-in">
      <div className="detail">
        <div className="detail-art">
          {owned ? (
            <div
              className="flip-scene"
              role="button"
              tabIndex={0}
              aria-label={`${card.nameZh}卡牌，点按翻面查看夜航手记`}
              aria-pressed={flipped}
              onClick={() => setFlipped((f) => !f)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((f) => !f); } }}
            >
              <div className={`flip-inner${flipped ? ' flipped' : ''}`}>
                <div className="flip-face flip-front">
                  <VrCard accent={card.accent} disabled={flipped}>
                    <CardArt card={card} style={{ width: '100%', filter: 'drop-shadow(0 22px 46px rgba(0,0,0,0.55))' }} />
                  </VrCard>
                </div>
                <div className="flip-face flip-back">
                  <span className="fb-kicker">· 夜航手记 ·</span>
                  <p className="fb-oracle">「{card.oracle}」</p>
                  <p className="fb-meaning">{card.meaning}</p>
                  <span className="fb-city">{card.city} · {card.nameEn}</span>
                  <span className="wax-seal" style={{ width: 34, height: 34, fontSize: 12 }} aria-hidden="true">
                    {card.arcana === 'major' ? '城' : '夜'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ width: 'min(64vw, 250px)' }}>
              <SealedCard arcana={card.arcana} suit={card.arcana === 'minor' ? card.suit : undefined} style={{ width: '100%' }} />
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-low)', letterSpacing: '0.14em' }}>
            {owned ? (entry!.count > 1 ? `已启封 ${entry!.count} 次` : '已启封') : '封缄中 · 尚未启封'}
          </div>
          {owned && <div className="flip-hint" aria-hidden="true">点按卡牌 · 3D 翻面看手记</div>}
          <Link to="/unseal" className="btn btn-primary" style={{ fontSize: 12.5, padding: '8px 16px' }}>
            去启封这一帧夜色
          </Link>
        </div>

        <div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.4em', color: 'var(--text-mid)' }}>
            {card.arcana === 'major' ? '· 城章 · CITY EMBLEM ·' : `· 夜签 · ${SUIT_ZH[card.suit].toUpperCase()} ·`}
          </p>
          <h1 style={{ margin: '8px 0 4px', fontSize: 28, letterSpacing: '0.2em' }}>{card.nameZh}</h1>
          <p style={{ margin: 0, color: 'var(--text-low)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {card.city} · {isMajor(card) ? `${card.roman} · ${card.nameEn}` : `${RANK_ZH[card.rank]} · ${card.nameEn}`}
          </p>

          <div className="kw-chips">
            {card.keywords.map((k) => <span key={k} className="kw-chip">{k}</span>)}
          </div>

          {card.arcana === 'minor' && (
            <p style={{ color: 'var(--text-mid)', fontSize: 13, marginTop: 16, lineHeight: 1.9 }}>
              {SUIT_ZH[card.suit]}系列 · {suitMeta?.element}之意象 —— {suitMeta?.theme}。
            </p>
          )}

          {/* 夜航手记 · 三层文案（城章完整三层；夜签精简为两层） */}
          <div className="note-paper" style={{ marginTop: 20 }}>
            <p className="oracle-line">「{card.oracle}」</p>
            <p className="interp">
              {isMajor(card) ? card.interpretation : card.meaning}
            </p>
            <div className="witch-note">
              <span>{noteBody}</span>
              <span style={{ whiteSpace: 'nowrap' }}>
                <span className="wax-seal" style={{ width: 34, height: 34, fontSize: 12 }} aria-hidden="true">
                  {card.arcana === 'major' ? '城' : '夜'}
                </span>
              </span>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#7a6a48', marginTop: 6 }}>
              ——{noteSign}
            </div>
          </div>

          <div className="meta-rows">
            {entry && (
              <>
                <div className="meta-row"><span>首次启封</span><b>{fmtTime(entry.firstAt)}</b></div>
                <div className="meta-row"><span>最近启封</span><b>{fmtTime(entry.lastAt)}</b></div>
                <div className="meta-row"><span>抄录次数</span><b>×{entry.count}</b></div>
              </>
            )}
            <div className="meta-row"><span>主光色</span><b style={{ color: card.accent }}>◈ {card.accent}</b></div>
            <div className="meta-row">
              <span>在夜泊阁中的位置</span>
              <b>{card.arcana === 'major' ? `城章 · 第 ${card.num + 1} 席` : `夜签 · ${SUIT_ZH[card.suit]}${RANK_ZH[card.rank]}`}</b>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <Link to="/collection" className="btn" style={{ fontSize: 12.5 }}>← 回到夜泊阁</Link>
          </div>
        </div>
      </div>

      {/* 360° 全景夜游 */}
      <div className="pano-panel">
        <div className="panel-title">全景夜游 · 360°</div>
        <PanoView card={card} locked={!owned} />
        <p style={{ color: 'var(--text-low)', fontSize: 11.5, marginTop: 8, letterSpacing: '0.08em' }}>
          {owned
            ? '按住拖动环顾四周；手机端可开启陀螺仪，左右倾斜即转动视线。'
            : '全景已就绪但尚未解封——启封这一帧夜色后，即可入内夜游。'}
        </p>
      </div>
    </div>
  );
}
