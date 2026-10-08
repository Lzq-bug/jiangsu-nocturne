import { Link } from 'react-router-dom';
import { ALL_CARDS } from '@/tarot/data';
import { ECONOMY } from '@/game/economy';

export default function AboutPage() {
  return (
    <div className="fade-in" style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div className="panel">
        <div className="panel-title">夜泊江苏 · Jiangsu Nocturne</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 13.5, lineHeight: 2.1, margin: 0 }}>
          这是一册可以玩的江苏夜色收藏：{ALL_CARDS.length} 帧水韵江苏的夜被泊在同一片水域——
          22 张「城章」收录全省最具代表性的夜景地标，56 张「夜签」按
          灯影、水岸、山寺、城垣四大夜色系列铺开。
          在观星台攒下星屑，在启封仪式上亲手点亮一帧夜色，
          然后走进 360° 全景，云夜游这方「月落乌啼霜满天」的土地。
        </p>
      </div>
      <div className="panel">
        <div className="panel-title">玩法一页纸</div>
        <ol style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 2.2, margin: 0, paddingLeft: 20 }}>
          <li>观星台捕星 → 攒「星屑」。</li>
          <li>启封仪式消耗 {ECONOMY.unsealCost} 星屑 → 从十二枚封缄中亲手翻开一帧。</li>
          <li>新帧永久入阁；重复的帧化作 {ECONOMY.duplicateRefund} 星屑补偿。</li>
          <li>连续 {ECONOMY.pityThreshold} 次无新帧，下一封必为新帧（收集保护）。</li>
          <li>城章掉落权重约 25%，夜签约 75%；未拥有的帧享有额外权重。</li>
          <li>夜泊画廊免费开放 22 张城章的 360° 全景夜游，随时可以先睹为快。</li>
        </ol>
      </div>
      <div className="panel">
        <div className="panel-title">独立原创声明</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 2, margin: 0 }}>
          本项目的景点夜景画面全部由程序化 SVG 生成器实时绘制（夜空、月相、星野、
          剪影母题、水面倒影均为原创算法与构图），轮廓系统（月芒尖碑等异形骨架）、
          边框与装饰语言、说明文案、配色体系与界面均为原创设计，
          不包含任何第三方游戏或素材库的可视资产。核心玩法、全景夜游完全本地运行，
          不依赖任何在线服务或 API Key。
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Link to="/" className="btn btn-primary">回到主厅</Link>
      </div>
    </div>
  );
}
