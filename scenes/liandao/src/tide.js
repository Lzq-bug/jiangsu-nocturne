/**
 * 潮信。海州湾属正规半日潮：一个太阳日里两涨两落，
 * 一个潮周期约 12 小时 50 分（12.83 小时），平均潮差约 3.3 米，
 * 高潮时刻每天推迟约 50 分钟。这里按纯数学实现，不依赖任何别的模块，
 * 所以水、船、滩、灯都可以只拿一个 hour 进来算当前潮位。
 *
 * 潮位以平均海面为 0，单位米。滩地在 environment.js 里按这个高程被淹或被露。
 */

export const TIDE_SPEC = {
  periodH: 12.83,      // 半日潮周期：12 小时 50 分
  rangeM: 3.3,         // 海州湾平均潮差
  amp: 1.65,
  dayPeriodH: 24.84,   // 一个太阴日：潮位每天推迟约 50 分钟的由来
  delayMin: 50,
  /** 场景起始时刻：休渔期最后一夜的黄昏（八月底，约 19:24） */
  startHour: 19.4,
};

const TWO_PI = Math.PI * 2;

/** 主分潮 + 全日不等项的原始合成，未归一 */
function rawTide(hour) {
  return Math.cos((TWO_PI * (hour - 4.1)) / TIDE_SPEC.periodH)
    + 0.11 * Math.cos((TWO_PI * (hour - 1.2)) / TIDE_SPEC.dayPeriodH);
}

/**
 * 归一化：让一个周期内的最高与最低正好差 3.3 米、对称于平均海面。
 * 不这么处理的话，叠了全日不等项之后极差会缩到 3.21，与文案对不上。
 */
const NORM = (() => {
  let lo = Infinity, hi = -Infinity;
  for (let h = 0; h < TIDE_SPEC.periodH; h += 1 / 1440) {
    const v = rawTide(h);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const mid = (hi + lo) / 2;
  return { mid, span: (hi - lo) / 2 };
})();

/**
 * 给定场景小时（可以超过 24，连续走），返回潮位（米，相对平均海面）。
 * 主分潮取半日潮，叠一个很小的全日不等项——真实半日潮港也有这点不对称，
 * 用来让夜里的最低潮比最高潮略深一点，看着不像纯正弦。
 */
export function tideAt(hour) {
  return ((rawTide(hour) - NORM.mid) / NORM.span) * (TIDE_SPEC.rangeM / 2);
}

/** 潮位对时间的导数（米/场景小时）：正为涨，负为落 */
export function tideRate(hour) {
  const e = 0.02;
  return (tideAt(hour + e) - tideAt(hour - e)) / (2 * e);
}

/** 距离下一个转流点还有几小时——潮谚语里的"潮头" */
export function nextTurn(hour) {
  const step = 0.05;
  let r = tideRate(hour);
  for (let i = 1; i <= 260; i++) {
    const h = hour + i * step;
    const rr = tideRate(h);
    if (r === 0 || Math.sign(rr) !== Math.sign(r)) return i * step;
    r = rr;
  }
  return 6.4;
}

/** 给 UI 的一句话状态 */
export function tideWord(hour) {
  const r = tideRate(hour);
  const v = Math.abs(r);
  if (v < 0.09) return tideAt(hour) > 0 ? '满潮·平流' : '干潮·平流';
  return r > 0 ? (v > 0.24 ? '涨潮·急流' : '涨潮') : (v > 0.24 ? '落潮·急流' : '落潮');
}

/** 场景时钟：从黄昏起算，speed 为"每现实秒走多少场景分钟" */
export function sceneHour(elapsed, speedMinPerSec) {
  return TIDE_SPEC.startHour + (elapsed * speedMinPerSec) / 60;
}

/** 24 小时制的小时数转"几点几分"文案 */
export function hhmm(hour) {
  const h = ((hour % 24) + 24) % 24;
  const m = Math.floor((h - Math.floor(h)) * 60);
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
