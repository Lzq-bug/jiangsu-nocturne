import { useState } from 'react';
import { Link } from 'react-router-dom';
import { audio } from '@/audio/AudioService';
import { useGame } from '@/game/store';
import { ECONOMY } from '@/game/economy';
import { getCardById, isMajor } from '@/tarot/data';
import { CardArt, SealedCard } from '@/ui/CardArt';

const FAN: number = 12;
const FAN_IDX = Array.from({ length: FAN }, (_, i) => i);

/**
 * 启封仪式
 * 规则诚实性：卡牌结果在「开始」瞬间即由引擎（store.unseal）确定并已写入存档；
 * 扇形选牌只是「由玩家亲手揭晓」的仪式表现——不存在假 VRF 或动画操纵概率。
 */
export default function UnsealPage() {
  const stardust = useGame((s) => s.stardust);
  const unseal = useGame((s) => s.unseal);
  const canUnseal = useGame((s) => s.canUnseal);

  const [stage, setStage] = useState<'gate' | 'fan' | 'result'>('gate');
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);

  function begin() {
    const r = unseal();
    if (!r) {
      audio.play('error');
      return;
    }
    audio.play('unseal');
    setPickedIdx(null);
    setStage('fan');
  }

  function pick(i: number) {
    if (pickedIdx !== null) return;
    setPickedIdx(i);
    audio.play('reveal');
    const r = useGame.getState().lastUnseal;
    window.setTimeout(() => {
      if (r?.isNew) audio.play('newCard');
      setStage('result');
    }, 950);
  }

  const result = useGame((s) => s.lastUnseal);
  const resultCard = result ? getCardById(result.card.id) : null;

  return (
    <div className="ritual fade-in">
      {stage === 'gate' && (
        <div className="ritual-stage">
          <div
            className="orb-gate"
            role="button"
            tabIndex={0}
            aria-label={canUnseal() ? '触碰封缄匣，开始启封' : '星屑不足，前往观星台'}
            onClick={() => (canUnseal() ? begin() : audio.play('error'))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); canUnseal() && begin(); } }}
          >
            <span className="orb-glyph" aria-hidden="true">✦</span>
          </div>
          <p style={{ color: 'var(--text-mid)', margin: 0, fontSize: 14, letterSpacing: '0.1em' }}>
            {canUnseal()
              ? <>触碰封缄匣 · 展开{FAN}枚封缄（消耗 {ECONOMY.unsealCost} ✦）</>
              : <>星屑不足（需 {ECONOMY.unsealCost} ✦，现有 {stardust} ✦）——<Link to="/starcatch" style={{ color: 'var(--cyan)' }}>去观星台</Link></>}
          </p>
        </div>
      )}

      {stage === 'fan' && (
        <div className="ritual-stage">
          <p style={{ color: 'var(--text-mid)', letterSpacing: '0.16em', margin: 0 }}>
            十二枚封缄静静排开 —— 亲手翻开其中一枚
          </p>
          <div
            style={{
              position: 'relative', width: 'min(92vw, 560px)', height: 300,
              display: 'grid', placeItems: 'center',
            }}
          >
            {FAN_IDX.map((i) => {
              const t = FAN === 1 ? 0.5 : i / (FAN - 1);
              const angle = -66 + t * 132;
              const picked = pickedIdx === i;
              const dim = pickedIdx !== null && !picked;
              return (
                <button
                  key={i}
                  className="card-btn"
                  aria-label={`翻开第 ${i + 1} 枚封缄`}
                  onClick={() => pick(i)}
                  style={{
                    position: 'absolute',
                    width: 92,
                    transform: `rotate(${angle}deg) translateY(-118px) ${picked ? 'scale(1.12)' : ''}`,
                    transformOrigin: '50% 260%',
                    transition: 'transform .5s cubic-bezier(.2,.8,.2,1), opacity .4s',
                    opacity: dim ? 0.15 : 1,
                    zIndex: picked ? 10 : i,
                    pointerEvents: pickedIdx !== null ? 'none' : 'auto',
                  }}
                >
                  <SealedCard arcana="major" style={{ width: '100%', filter: picked ? 'none' : 'brightness(0.9)' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stage === 'result' && result && resultCard && (
        <div className="ritual-stage reveal-card-wrap">
          {result.isNew ? (
            <span className="new-badge">✦ 新牌入阁</span>
          ) : (
            <span className="new-badge" style={{ borderColor: 'rgba(230,198,135,0.4)', color: 'var(--gold)' }}>
              重复的遗言 · 补偿 +{result.refund} ✦
            </span>
          )}
          <div style={{ width: 'min(46vw, 190px)' }}>
            <CardArt card={resultCard} style={{ width: '100%', filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.6))' }} />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 19, letterSpacing: '0.22em' }}>{resultCard.nameZh}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', letterSpacing: '0.12em' }}>
              {isMajor(resultCard) ? `月章 · ${resultCard.roman}` : `星签 · ${resultCard.nameEn}`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--silver)', marginTop: 6, fontFamily: 'var(--font-kai)' }}>
              「{resultCard.oracle}」
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className="btn" to={`/card/${resultCard.id}`}>翻阅这一页手记 →</Link>
            <Link className="btn" to="/collection">前往魔女阁</Link>
            <button className="btn btn-primary" onClick={begin} disabled={!canUnseal()}>
              再启一封（{ECONOMY.unsealCost} ✦）
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-low)' }}>星屑余量 {stardust}</div>
        </div>
      )}
    </div>
  );
}
