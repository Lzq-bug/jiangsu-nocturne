import * as THREE from 'three';
import { TIDE, SEA, WORKS, WEIR, RIVER } from './data.js';

/**
 * 夜潮：潮头自海面（东）向西推进，撞到草荡岸线后分成两股——
 * 一股在河上坝口漫进来，一股沿堤脚散去。
 *
 * 计数用"潮程 一百四十二里"，取自《宋史·河渠志》所载捍海堰之长度；
 * 潮头的速度、波高与入河节奏都是写意，不代表实测潮候。
 */
const SEA_START = 780;                       // 潮头出场处：雾里刚看得见的地方
const SHORE = WORKS.reedX1 - 6;              // 撞岸处

export class NightTide {
  constructor({ water, env, props, onCount }) {
    this.water = water;
    this.env = env;
    this.props = props;
    this.onCount = onCount || (() => {});
    this.items = [];          // 每汛 { t0 }
    this.li = 0;              // 已推里数
    this.ringing = false;
    this.queue = 0;
    this.nextAt = 0;
    this.state = { frontX: -99999, amp: 0, level: 0 };
    this._lastArrival = -99;
    this.total = TIDE.liTotal;
  }

  get surging() { return this.ringing || this.items.length > 0; }

  one(t) {
    if (this.li >= this.total) this.li = 0;
    this.items.push({ t0: t, done: false });
    this.li = Math.min(this.total, this.li + TIDE.liPerSurge);
    this.onCount(this.li, this.ringing);
    return true;
  }

  full(t) {
    this.ringing = true;
    this.queue = Math.ceil((this.total - this.li) / TIDE.liPerSurge);
    this.nextAt = t;
    this.onCount(this.li, true);
  }

  stop() {
    this.ringing = false;
    this.queue = 0;
    this.onCount(this.li, false);
  }

  reset() {
    this.stop();
    this.items.length = 0;
    this.li = 0;
    this.onCount(0, false);
  }

  update(t, dt, camPos) {
    if (this.ringing) {
      while (this.queue > 0 && t >= this.nextAt) {
        this.one(t);
        this.nextAt += TIDE.interval;
        this.queue--;
      }
      if (this.queue <= 0 && this.li >= this.total) {
        this.ringing = false;
        this.onCount(this.li, false);
      }
    }

    // 潮头：最前面那一汛决定位置
    let frontX = -99999, amp = 0, level = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const age = t - it.t0;
      if (age > TIDE.sustain * 1.6) { this.items.splice(i, 1); continue; }
      const x = SEA_START - age * TIDE.seaSpeed;
      if (age >= 0 && x > SHORE - 40) { frontX = Math.max(frontX, x); }
      const fade = Math.exp(-age / TIDE.sustain);
      amp = Math.max(amp, fade);
      // 撞岸之后水位抬起，退潮再落下
      const rise = Math.max(0, Math.min(1, (SHORE - x) / 90));
      level = Math.max(level, rise * fade);
      if (!it.done && x <= SHORE) {
        it.done = true;
        this.onArrive(t);
      }
    }
    if (frontX < -90000) amp = 0;

    this.state.frontX = frontX;
    this.state.amp = amp;
    this.state.level = level;
    this.water.setTide(this.state);
    return this.state;
  }

  /** 潮头拍岸：惊起水鸟，河上坝口与堤脚各进一波 */
  onArrive(t) {
    if (t - this._lastArrival < 0.6) return;
    this._lastArrival = t;
    const shoreZ = -20 + Math.random() * 90;
    this.env.startle(WORKS.reedX1, shoreZ, t);
    // 河面两波：一波从坝口进来，一波沿河北上
    this.water.rings.emit(RIVER.halfWidth * 0.4, WEIR.z, t, 1.0);
    this.water.rings.emit(-RIVER.halfWidth * 0.2, WEIR.z + 6, t + 0.5, 0.72);
    this.water.rings.emit(RIVER.halfWidth * 0.5, -60, t + 1.1, 0.55);
  }
}
