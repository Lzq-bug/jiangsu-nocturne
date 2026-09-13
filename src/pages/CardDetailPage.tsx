import { Link, useParams } from 'react-router-dom';
import { useGame } from '@/game/store';
import { getCardById, isMajor } from '@/tarot/data';
import { SUITS } from '@/tarot/data/minorSource';
import { CardArt, SealedCard } from '@/ui/CardArt';
import { RANK_ZH, SUIT_ZH } from '@/tarot/types';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const collection = useGame((s) => s.collection);
  const card = id ? getCardById(id) : undefined;
  const entry = card ? collection[card.id] : undefined;

  if (!card) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }} className="fade-in">
        <p style={{ color: 'var(--text-mid)' }}>这一页手记不存在。</p>
        <Link to="/collection" className="btn">回到魔女阁</Link>
      </div>
    );
  }

  const owned = Boolean(entry);
  const suitMeta = card.arcana === 'minor' ? SUITS.find((s) => s.key === card.suit) : undefined;
  const signIdx = card.note.lastIndexOf('——');
  const noteBody = signIdx > 0 ? card.note.slice(0, signIdx) : card.note;
  const noteSign = signIdx > 0 ? card.note.slice(signIdx + 2) : '魔女手记';

  return (
    <div className="detail fade-in">
      <div className="detail-art">
        <div style={{ width: 'min(64vw, 250px)' }}>
          {owned
            ? <CardArt card={card} style={{ width: '100%', filter: 'drop-shadow(0 22px 46px rgba(0,0,0,0.55))' }} />
            : <SealedCard arcana={card.arcana} suit={card.arcana === 'minor' ? card.suit : undefined} style={{ width: '100%' }} />}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-low)', letterSpacing: '0.14em' }}>
          {owned ? (entry!.count > 1 ? `已启封 ${entry!.count} 次` : '已启封') : '封缄中 · 尚未启封'}
        </div>
        <Link to="/unseal" className="btn btn-primary" style={{ fontSize: 12.5, padding: '8px 16px' }}>
          去启封这封遗言
        </Link>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.4em', color: 'var(--text-mid)' }}>
          {card.arcana === 'major' ? '· 月章 · THE MAJOR ARCANA ·' : `· 星签 · ${suitMeta?.zh.toUpperCase()} ·`}
        </p>
        <h1 style={{ margin: '8px 0 4px', fontSize: 28, letterSpacing: '0.2em' }}>{card.nameZh}</h1>
        <p style={{ margin: 0, color: 'var(--text-low)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {isMajor(card) ? `${card.roman} · ${card.nameEn}` : `${RANK_ZH[card.rank]} · ${card.nameEn}`}
        </p>

        <div className="kw-chips">
          {card.keywords.map((k) => <span key={k} className="kw-chip">{k}</span>)}
        </div>

        {card.arcana === 'minor' && (
          <p style={{ color: 'var(--text-mid)', fontSize: 13, marginTop: 16, lineHeight: 1.9 }}>
            {SUIT_ZH[card.suit]} · {suitMeta?.element}元素 —— {suitMeta?.theme}。
          </p>
        )}

        {/* 魔女手记 · 三层文案（大牌完整三层；小牌精简为两层） */}
        <div className="note-paper" style={{ marginTop: 20 }}>
          <p className="oracle-line">「{card.oracle}」</p>
          <p className="interp">
            {isMajor(card) ? card.interpretation : card.meaning}
          </p>
          <div className="witch-note">
            <span>{noteBody}</span>
            <span style={{ whiteSpace: 'nowrap' }}>
              <span className="wax-seal" style={{ width: 34, height: 34, fontSize: 12 }} aria-hidden="true">
                {card.arcana === 'major' ? '月' : '星'}
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
            <span>在魔女阁中的位置</span>
            <b>{card.arcana === 'major' ? `月章 · 第 ${card.num + 1} 席` : `星签 · ${suitMeta?.zh}${RANK_ZH[card.rank]}`}</b>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <Link to="/collection" className="btn" style={{ fontSize: 12.5 }}>← 回到魔女阁</Link>
        </div>
      </div>
    </div>
  );
}
