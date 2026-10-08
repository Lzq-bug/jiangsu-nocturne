import { Link } from 'react-router-dom';
import { useGame } from '@/game/store';
import { ownedCount, progressPercent } from '@/game/collection';
import { ALL_CARDS } from '@/tarot/data';
import { ECONOMY } from '@/game/economy';

export default function HomePage() {
  const collection = useGame((s) => s.collection);
  const stardust = useGame((s) => s.stardust);
  const owned = ownedCount(collection);
  const pct = progressPercent(collection);

  return (
    <div className="home fade-in">
      <section className="desk-hero">
        <div className="hero-copy">
          <p className="eyebrow">· JIANGSU NOCTURNE ·</p>
          <h1>夜泊江苏</h1>
          <p>
            月落乌啼，江枫渔火——江苏的夜色，值得被一帧帧收藏。<br />
            在观星台攒下星屑，于启封仪式上亲手点亮一帧夜色，<br />
            收藏到的每一帧，都能进入 360° 全景，云夜游水韵江苏。
          </p>
          <div className="hero-how" aria-label="玩法速览">
            <b>① 玩观星小游戏</b><i>→</i>
            <b>② 获得星屑</b><i>→</i>
            <b>③ 启封夜景卡</b><i>→</i>
            <b>④ 收藏 78 帧夜色</b>
          </div>
          <div className="hero-actions">
            <Link to="/starcatch" className="btn">🔭 前往观星台 · 攒星屑</Link>
            <Link to="/unseal" className="btn btn-primary">✦ 启封仪式 · {ECONOMY.unsealCost} 星屑一次</Link>
          </div>
          <div className="progress-wrap" style={{ marginTop: 18 }}>
            <div className="progress-label">
              <span>夜泊阁收集进度</span>
              <span>{owned} / {ALL_CARDS.length} · {pct}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
            </div>
          </div>
        </div>
        <div className="hero-orb" aria-hidden="true">
          <MoonDial />
        </div>
      </section>

      <section className="home-grid">
        <Link to="/starcatch" className="entry-card">
          <div className="ico">🔭</div>
          <h3>观星台</h3>
          <p>在夜幕里捕捞漂过的星屑星与金星，一局 {45} 秒，是启封资源的唯一来源。</p>
        </Link>
        <Link to="/unseal" className="entry-card">
          <div className="ico">✦</div>
          <h3>启封仪式</h3>
          <span className="sub">消耗星屑 · 点亮一帧夜色</span>
          <p>从扇形的封缄牌阵中亲手翻开一帧江苏夜景。新帧入阁，重复化作补偿。</p>
        </Link>
        <Link to="/collection" className="entry-card">
          <div className="ico">📖</div>
          <h3>夜泊阁</h3>
          <span className="sub">查看已收藏的 78 帧夜色</span>
          <p>七十八个牌位的夜景档案库。已启封的帧可见真容、可入全景夜游，封缄的位子静静等它到来。</p>
        </Link>
        <Link to="/gallery" className="entry-card">
          <div className="ico">🌆</div>
          <h3>夜泊画廊</h3>
          <span className="sub">22 张城章 · 免费开放</span>
          <p>二十二处江苏地标夜景先睹为快。点触任意一帧，即刻 360° 全景夜游。</p>
        </Link>
      </section>

      <section className="panel">
        <div className="panel-title">今日夜航手记</div>
        <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 13.5, lineHeight: 1.9 }}>
          星屑余量 <b style={{ color: 'var(--cyan)' }}>{stardust}</b> ——
          {stardust >= ECONOMY.unsealCost
            ? '够一次启封了。去仪式上亲手点亮一帧江苏的夜吧。'
            : `还差 ${ECONOMY.unsealCost - stardust} 枚就能启封。观星台今晚的天色不错。`}
        </p>
      </section>
    </div>
  );
}

/** 首页的黄铜月相仪（装饰） */
function MoonDial() {
  const phases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 240 }} role="img" aria-label="黄铜月相仪">
      <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(178,140,79,0.35)" strokeWidth="1" />
      <circle cx="100" cy="100" r="72" fill="none" stroke="rgba(178,140,79,0.2)" strokeWidth="0.7" strokeDasharray="3 5" />
      <circle cx="100" cy="100" r="56" fill="rgba(13,18,38,0.7)" stroke="rgba(199,206,221,0.25)" />
      <path d="M 100 52 A 48 48 0 0 1 100 148 A 30 48 0 0 0 100 52 Z" fill="var(--silver)" opacity="0.85" />
      {phases.map((_, i) => {
        const ang = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        const x = 100 + Math.cos(ang) * 79;
        const y = 100 + Math.sin(ang) * 79;
        return <circle key={i} cx={x} cy={y} r="2.4" fill="var(--gold)" opacity={i === 4 ? 1 : 0.45} />;
      })}
      <path d="M 100 14 L 103 22 L 100 20 L 97 22 Z" fill="var(--gold)" />
    </svg>
  );
}
