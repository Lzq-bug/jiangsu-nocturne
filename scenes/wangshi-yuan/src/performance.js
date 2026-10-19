import { SHOW } from './data.js';

/** 园中时刻：一拨从 19:30 起，45 分钟走完九处，此处按比例压进场景时间 */
const CLOCK_START = 19 * 60 + 30;      // 分钟
const PROGRAM_MIN = 45;                // 一场实际时长

/**
 * 网师夜花园的一场戏。
 * 场景时间里的进度按节目表推进；切换点位时通知 UI、听客与灯光。
 */
export class NightGarden {
  constructor({ onItem, onLine, onEnd, rings, stageAt }) {
    this.items = SHOW;
    this.onItem = onItem;
    this.onLine = onLine;
    this.onEnd = onEnd;
    this.rings = rings;
    this.stageAt = stageAt;        // (placeId) => Vector3 | null
    this.i = -1;
    this.playing = false;
    this.clock = 0;               // 本场已经走过的秒数
    this.itemT = 0;
    this.lineIdx = 0;
    this.total = this.items.reduce((s, x) => s + x.dur, 0);
  }

  get item() { return this.i >= 0 ? this.items[this.i] : null; }

  /** 园中时刻与拨次，供戏报显示 */
  gardenClock() {
    const k = this.total > 0 ? Math.min(1, this.clock / this.total) : 0;
    const min = CLOCK_START + k * PROGRAM_MIN;
    const hh = Math.floor(min / 60), mm = Math.floor(min % 60);
    const batch = 1 + Math.floor(((min - CLOCK_START) / 30));
    return { text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, batch };
  }

  start(t) {
    if (this.playing) return;
    this.playing = true;
    this.seek(0, t);
  }

  stop() {
    this.playing = false;
    this.i = -1;
    this.clock = 0;
    this.itemT = 0;
    this.lineIdx = 0;
    this.onItem(null, -1);
    this.onLine('', 0);
  }

  toggle(t) {
    if (this.playing) this.stop();
    else this.start(t);
    return this.playing;
  }

  next(t) {
    if (!this.playing) this.start(t);
    else this.seek(this.i + 1, t);
  }

  seek(i, t) {
    if (i < 0) i = 0;
    if (i >= this.items.length) { this.stop(); return; }
    // 累计到该点位的开场时刻
    this.clock = this.items.slice(0, i).reduce((s, x) => s + x.dur, 0);
    this.i = i;
    this.itemT = 0;
    this.lineIdx = 0;
    const item = this.items[i];
    this.onItem(item, i);
    this.emitLine(0, t);
    if (item.onWater) this.splash(t, 1.2);
  }

  splash(t, amp = 1) {
    const item = this.item;
    if (!item || !this.rings) return;
    const at = this.stageAt(item.place);
    if (!at) return;
    // 水阁一开腔，池面就从台脚起一圈
    this.rings.emit(at.x, at.z - 1.4, t, amp);
  }

  emitLine(k) {
    const item = this.item;
    if (!item) { this.onLine('', 0, null); return; }
    const n = item.lines.length;
    if (!n) return;
    const idx = Math.min(n - 1, Math.floor(k * n));
    this.lineIdx = idx;
    this.onLine(item.lines[idx], idx, item);
  }

  update(t, dt, tempo = 1) {
    if (!this.playing) return;
    const step = dt * tempo;
    const item = this.item;
    if (!item) return;
    this.clock += step;
    this.itemT += step;
    const k = Math.min(1, this.itemT / item.dur);
    this.emitLine(k);
    if (item.onWater) {
      this.splashT = (this.splashT || 0) + step;
      if (this.splashT > 2.1) { this.splashT = 0; this.splash(t, 0.6 + 0.5 * k); }
    }
    if (k >= 1) {
      if (this.i + 1 >= this.items.length) {
        const last = item;
        this.stop();
        this.onEnd(last);
      } else {
        this.seek(this.i + 1, t);
      }
    }
  }

  /** 0~1 全场进度与当前点位进度 */
  progress() {
    const item = this.item;
    return {
      show: Math.min(1, this.clock / this.total),
      item: item ? Math.min(1, this.itemT / item.dur) : 0,
    };
  }
}
