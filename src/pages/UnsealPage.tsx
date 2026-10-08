import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { audio } from '@/audio/AudioService';
import { useGame } from '@/game/store';
import { ECONOMY } from '@/game/economy';
import { getCardById, isMajor } from '@/tarot/data';
import { CardArt, SealedCard } from '@/ui/CardArt';
import { VrCard } from '@/ui/VrCard';

const FAN: number = 12;
const FAN_IDX = Array.from({ length: FAN }, (_, i) => i);

/**
 * 扇形几何：按视口宽度自适应。
 * 12 枚封缄的旋转外扩天然会产生很宽的外框（1440 下约 1286px），
 * 窄屏若不收窄张角 / 抬升 / 旋转原点，就会顶出视口造成横向滚动。
 * 每一档都满足：外扩半宽 ≤ 视口半宽 − 6px。
 */
interface FanSpec {
  cardW: number;   // 单张封缄宽度
  spread: number;  // 张角半幅（度）
  lift: number;    // 沿牌自身轴线的抬升（px）
  boxW: number;    // 扇形容器宽
  boxH: number;    // 扇形容器高
  originY: number; // 旋转原点（相对牌高的百分比）
  gapTop: number;  // 容器上边距（避免最高处的牌压到说明文字）
}

function fanSpec(vw: number): FanSpec {
  if (vw >= 1360) return { cardW: 92, spread: 66, lift: 118, boxW: 560, boxH: 300, originY: 260, gapTop: 88 };
  if (vw >= 1200) return { cardW: 88, spread: 58, lift: 108, boxW: 560, boxH: 288, originY: 250, gapTop: 84 };
  if (vw >= 1000) return { cardW: 78, spread: 52, lift: 96, boxW: 540, boxH: 272, originY: 240, gapTop: 78 };
  if (vw >= 800) return { cardW: 68, spread: 46, lift: 86, boxW: 520, boxH: 252, originY: 235, gapTop: 72 };
  if (vw >= 640) return { cardW: 60, spread: 42, lift: 78, boxW: 480, boxH: 234, originY: 230, gapTop: 66 };
  if (vw >= 480) return { cardW: 52, spread: 36, lift: 70, boxW: 400, boxH: 214, originY: 225, gapTop: 60 };
  if (vw >= 400) return { cardW: 46, spread: 33, lift: 62, boxW: 300, boxH: 194, originY: 220, gapTop: 56 };
  return { cardW: 42, spread: 30, lift: 56, boxW: 260, boxH: 180, originY: 215, gapTop: 52 };
}

/** 启封仪式
 * 规则诚实性：卡牌结果在「开始」瞬间即由引擎（store.unseal）确定并已写入存档；
 * 扇形选牌只是「由玩家亲手揭晓」的仪式表现——不存在假 VRF 或动画操纵概率。
 */
export default function UnsealPage() {
  const stardust = useGame((s) => s.stardust);
  const unseal = useGame((s) => s.unseal);
  const canUnseal = useGame((s) => s.canUnseal);

  const [stage, setStage] = useState<'gate' | 'fan' | 'result'>('gate');
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [vw, setVw] = useState<number>(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const spec = fanSpec(vw);

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
        <div className="ritual-stage ritual-stage-fan">
          <p style={{ color: 'var(--text-mid)', letterSpacing: '0.16em', margin: 0 }}>
            十二枚封缄静静排开 —— 亲手翻开其中一枚
          </p>
          <div
            className="fan-box"
            style={{
              position: 'relative', width: `min(92vw, ${spec.boxW}px)`, height: spec.boxH,
              marginTop: spec.gapTop,
              display: 'grid', placeItems: 'center',
            }}
          >
            {FAN_IDX.map((i) => {
              const t = i / (FAN - 1);
              const angle = -spec.spread + t * spec.spread * 2;
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
                    width: spec.cardW,
                    transform: `rotate(${angle}deg) translateY(-${spec.lift}px) ${picked ? 'scale(1.12)' : ''}`,
                    transformOrigin: `50% ${spec.originY}%`,
                    transition: 'transform .5s cubic-bezier(.2,.8,.2,1), opacity .4s',
                    opacity: dim ? 0.15 : 1,
                    zIndex: picked ? 10 : i,
                    pointerEvents: pickedIdx !== null ? 'none' : 'auto',
                  }}
                >
                  <SealedCard arcana="major" style={{ width: '100%' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stage === 'result' && result && resultCard && (
        <div className="ritual-stage reveal-card-wrap">
          {result.isNew ? (
            <span className="new-badge">✦ 新帧入阁</span>
          ) : (
            <span className="new-badge" style={{ borderColor: 'rgba(230,198,135,0.4)', color: 'var(--gold)' }}>
              重复的夜色 · 补偿 +{result.refund} ✦
            </span>
          )}
          <div style={{ width: 'min(46vw, 190px)' }}>
            <VrCard accent={resultCard.accent}>
              <CardArt card={resultCard} style={{ width: '100%', filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.6))' }} />
            </VrCard>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 19, letterSpacing: '0.22em' }}>{resultCard.nameZh}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', letterSpacing: '0.12em' }}>
              {isMajor(resultCard) ? `城章 · ${resultCard.roman}` : `夜签 · ${resultCard.nameEn}`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--silver)', marginTop: 6, fontFamily: 'var(--font-kai)' }}>
              「{resultCard.oracle}」
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className="btn" to={`/card/${resultCard.id}`}>夜游这一帧 →</Link>
            <Link className="btn" to="/collection">前往夜泊阁</Link>
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
