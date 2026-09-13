import { Link } from 'react-router-dom';
import { ALL_CARDS } from '@/tarot/data';
import { ECONOMY } from '@/game/economy';

export default function AboutPage() {
  return (
    <div className="fade-in" style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div className="panel">
        <div className="panel-title">宵月秘藏 · The Veiled Moon Reliquary</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 13.5, lineHeight: 2.1, margin: 0 }}>
          这是一册可以玩的魔女档案：{ALL_CARDS.length} 封「星之遗言」被封存在旧银圣物匣中——
          22 张「月章」庄重如夜祷，56 张「星签」轻盈如星屑。
          在观星台攒下星屑，在启封仪式上亲手破开火漆，
          让每一张牌带着它的神谕、象征与魔女的批注，住进只属于你的魔女阁。
        </p>
      </div>
      <div className="panel">
        <div className="panel-title">玩法一页纸</div>
        <ol style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 2.2, margin: 0, paddingLeft: 20 }}>
          <li>观星台捕星 → 攒「星屑」。</li>
          <li>启封仪式消耗 {ECONOMY.unsealCost} 星屑 → 从十二枚封缄中亲手翻开一枚。</li>
          <li>新牌永久入阁；重复的牌化作 {ECONOMY.duplicateRefund} 星屑补偿。</li>
          <li>连续 {ECONOMY.pityThreshold} 次无新牌，下一封必为新牌（收集保护）。</li>
          <li>月章掉落权重约 25%，星签约 75%；未拥有的牌享有额外权重。</li>
        </ol>
      </div>
      <div className="panel">
        <div className="panel-title">独立原创声明</div>
        <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 2, margin: 0 }}>
          本项目的卡牌名称沿用公共领域的传统塔罗体系；轮廓系统（月芒尖碑/火熜/圣爵/剑锋/环璧）、
          边框与装饰语言、全部卡面图形（程序化 SVG）、说明文案、配色体系与界面均为原创设计，
          不包含任何第三方游戏的可视资产。AI、语音与链上铸造均为可选能力，
          缺席时游戏完整可玩。
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Link to="/" className="btn btn-primary">回到主厅</Link>
      </div>
    </div>
  );
}
