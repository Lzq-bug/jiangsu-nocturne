/**
 * 昆曲引：全部由 Web Audio 实时合成——板、鼓、笛、水磨腔。
 * 这里是板眼与腔形的示意（滑音、颤音、拖腔），不含任何录音，也不模仿某位演员。
 * AudioContext 只在第一次手势里创建，无头截图时不会阻塞渲染。
 */

const PENTA = [262, 294, 330, 392, 440, 524, 588, 660];

/** 板眼：一拍里 1 板 + 3 眼；{d: 占几眼, deg: 音级, bend: 起始滑音(音分), vib: 颤幅} */
const PHRASES = {
  xiangzhou: {
    title: '游园 · 皂罗袍意',
    beats: 8,
    notes: [
      { d: 4, deg: 5, bend: -160, vib: 0.011 },
      { d: 2, deg: 4, bend: 0, vib: 0.008 },
      { d: 6, deg: 3, bend: 90, vib: 0.014 },
      { d: 3, deg: 2, bend: -70, vib: 0.007 },
      { d: 8, deg: 1, bend: 0, vib: 0.016 },
      { d: 4, deg: 3, bend: 120, vib: 0.009 },
      { d: 12, deg: 0, bend: -40, vib: 0.018 },
    ],
  },
  yuanyang: {
    title: '惊梦 · 山坡羊意',
    beats: 8,
    notes: [
      { d: 3, deg: 2, bend: 140, vib: 0.009 },
      { d: 5, deg: 4, bend: -60, vib: 0.013 },
      { d: 2, deg: 5, bend: 0, vib: 0.007 },
      { d: 7, deg: 4, bend: 100, vib: 0.015 },
      { d: 4, deg: 3, bend: 0, vib: 0.008 },
      { d: 4, deg: 1, bend: -120, vib: 0.012 },
      { d: 11, deg: 2, bend: 60, vib: 0.017 },
    ],
  },
};

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function impulse(ctx, seconds = 2.8, decay = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // 前 20ms 不糊，之后按指数衰减的噪声当庭院与水面的回响
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.02 ? 0.35 : 1);
    }
  }
  return buf;
}

export class KunQu {
  constructor({ onBeat, onAir, position }) {
    this.onBeat = onBeat;
    this.onAir = onAir;
    this.position = position;
    this.ctx = null;
    this.playing = false;
    this.beats = 0;
    this.title = '—';
    this.air = 0;
    this._queue = [];
    this._nextAt = 0;
    this._rain = null;
  }

  /** 第一次手势里建图，之后复用 */
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb);
    this.verb.connect(this.master);
    this._noise = noiseBuffer(ctx, 2);
    this.ready = true;
    return ctx;
  }

  _panner(node) {
    const ctx = this.ctx;
    if (!ctx.createPanner) return node;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.setPosition(this.position.x, this.position.y, this.position.z);
    node.connect(p);
    p.connect(this.master);
    p.connect(this.verbIn);
    return p;
  }

  _env(g, t0, { a = 0.05, d = 0.2, s = 0.6, r = 0.3, dur = 1, peak = 1 }) {
    const g0 = g.gain;
    g0.setValueAtTime(0.0001, t0);
    g0.linearRampToValueAtTime(peak, t0 + a);
    g0.linearRampToValueAtTime(peak * s, t0 + a + d);
    g0.setValueAtTime(peak * s, t0 + Math.max(a + d, dur - r));
    g0.linearRampToValueAtTime(0.0001, t0 + dur);
  }

  /** 板：一记脆的檀板 */
  tap(which = 'board', when) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = when ?? ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = which === 'board' ? 2100 : 900;
    bp.Q.value = which === 'board' ? 1.6 : 1.1;
    const g = ctx.createGain();
    this._env(g, t, { a: 0.002, d: 0.05, s: 0.18, r: 0.11, dur: 0.18, peak: which === 'board' ? 0.5 : 0.35 });
    src.connect(bp); bp.connect(g);
    this._panner(g);
    src.start(t); src.stop(t + 0.22);
    // 鼓：加一点低频的胸腔
    if (which === 'drum') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(58, t + 0.22);
      const og = ctx.createGain();
      this._env(og, t, { a: 0.004, d: 0.1, s: 0.2, r: 0.2, dur: 0.34, peak: 0.45 });
      o.connect(og); this._panner(og);
      o.start(t); o.stop(t + 0.4);
    }
  }

  /** 水磨腔：两个错开的振荡器过一组共振峰，滑音 + 慢慢起来的颤音 */
  _voice(freq, t0, dur, { vib = 0.012, bend = 0 } = {}) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    const formants = [[660, 90, 1.0], [1260, 110, 0.5], [2560, 140, 0.24]];
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const reed = ctx.createOscillator();
    reed.type = 'triangle';
    const harm = ctx.createOscillator();
    harm.type = 'sine';
    const hg = ctx.createGain();
    hg.gain.value = 0.22;
    const startF = freq * Math.pow(2, bend / 1200);
    reed.frequency.setValueAtTime(startF, t0);
    reed.frequency.exponentialRampToValueAtTime(freq, t0 + Math.min(0.42, dur * 0.34));
    harm.frequency.setValueAtTime(startF * 2, t0);
    harm.frequency.exponentialRampToValueAtTime(freq * 2, t0 + Math.min(0.42, dur * 0.34));
    // 颤音在腔走起来之后才加，起音是直的
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.1;
    const lfoG = ctx.createGain();
    lfoG.gain.setValueAtTime(0, t0);
    lfoG.gain.linearRampToValueAtTime(freq * vib, t0 + dur * 0.55);
    lfo.connect(lfoG);
    lfoG.connect(reed.frequency);
    lfoG.connect(harm.frequency);
    reed.connect(mix);
    harm.connect(hg); hg.connect(mix);
    for (const [f, q, gain] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q / 12;
      const fg = ctx.createGain();
      fg.gain.value = gain;
      mix.connect(bp); bp.connect(fg); fg.connect(out);
    }
    // 气流噪声：一点点嘶，让"肉"感出来
    const breath = ctx.createBufferSource();
    breath.buffer = this._noise;
    breath.loop = true;
    const bbp = ctx.createBiquadFilter();
    bbp.type = 'bandpass'; bbp.frequency.value = 1900; bbp.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.02, t0);
    bg.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.4);
    breath.connect(bbp); bbp.connect(bg); bg.connect(out);
    this._env(out, t0, { a: 0.12, d: dur * 0.3, s: 0.72, r: dur * 0.3, dur, peak: 0.34 });
    reed.start(t0); harm.start(t0); lfo.start(t0); breath.start(t0);
    reed.stop(t0 + dur + 0.1); harm.stop(t0 + dur + 0.1);
    lfo.stop(t0 + dur + 0.1); breath.stop(t0 + dur + 0.1);
    this._panner(out);
    return out;
  }

  /** 曲笛：气振快、音头软 */
  _flute(freq, t0, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * 2, t0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t0);
    lp.frequency.linearRampToValueAtTime(2600, t0 + dur * 0.4);
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 4.2;
    const lg = ctx.createGain(); lg.gain.value = freq * 0.008;
    lfo.connect(lg); lg.connect(o.frequency);
    this._env(g, t0, { a: 0.07, d: dur * 0.3, s: 0.8, r: dur * 0.28, dur, peak: 0.11 });
    o.connect(lp); lp.connect(g);
    this._panner(g);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + dur + 0.08); lfo.stop(t0 + dur + 0.08);
  }

  sing(key = 'xiangzhou') {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const ph = PHRASES[key] || PHRASES.xiangzhou;
    this.playing = true;
    this.title = ph.title;
    this.beatDur = 0.98;
    this._queue = ph.notes.map((nn) => ({ ...nn }));
    this._eye = 0;
    this._nextAt = ctx.currentTime + 0.12;
    this._phraseEnd = this._nextAt;
    return ph;
  }

  stop() {
    if (!this.ctx) return;
    this.playing = false;
    this._queue = [];
    this.air = 0;
    if (this.onAir) this.onAir(0);
  }

  /** 雨打芭蕉：一层带通噪声 + 随机滴答 */
  rain(seconds = 8) {
    const ctx = this.ensure();
    if (!ctx || this._rain) return;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 1.4);
    g.gain.setValueAtTime(0.09, t + Math.max(2, seconds - 2));
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    src.connect(bp); bp.connect(hp); hp.connect(g);
    this._panner(g);
    src.start(t); src.stop(t + seconds + 0.2);
    this._rain = { src, g, until: t + seconds };
  }

  stopRain() {
    if (!this._rain || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      this._rain.g.gain.cancelScheduledValues(t);
      this._rain.g.gain.setValueAtTime(this._rain.g.gain.value, t);
      this._rain.g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
      this._rain.src.stop(t + 0.6);
    } catch (e) { /* 已自然结束 */ }
    this._rain = null;
  }

  /** 每帧：提前 0.35s 把下一记排上，同时给画面返回当前气口 */
  update() {
    if (!this.ctx) return 0;
    const ctx = this.ctx;
    if (this.playing && this._queue.length) {
      while (this._nextAt < ctx.currentTime + 0.4 && this._queue.length) {
        const nn = this._queue.shift();
        const dur = nn.d * this.beatDur;
        const freq = PENTA[Math.max(0, Math.min(PENTA.length - 1, nn.deg))];
        this._voice(freq, this._nextAt, dur, { vib: nn.vib, bend: nn.bend });
        if (this._eye % 4 === 0) this.tap('board', this._nextAt);
        else this.tap('drum', this._nextAt + this.beatDur * 0.5);
        this._flute(freq, this._nextAt + 0.02, dur * 0.9);
        const at = this._nextAt;
        const when = (at - ctx.currentTime) * 1000;
        setTimeout(() => { if (this.onBeat) this.onBeat(); }, Math.max(0, when));
        this._nextAt += dur;
        this._eye += nn.d;
        this._phraseEnd = this._nextAt + dur * 0.4;
      }
      if (!this._queue.length && ctx.currentTime > this._nextAt) this.playing = false;
    }
    // 气口包络：给画面的呼吸
    const remain = this._nextAt - ctx.currentTime;
    const target = this.playing ? Math.max(0, Math.min(1, 0.35 + remain)) : 0;
    this.air += (target - this.air) * 0.08;
    if (this.onAir) this.onAir(this.air);
    if (this._rain && ctx.currentTime > this._rain.until) this._rain = null;
    return this.air;
  }

  get ringing() { return this.playing; }
  get repertory() { return Object.keys(PHRASES); }
  get titles() { return Object.fromEntries(Object.entries(PHRASES).map(([k, v]) => [k, v.title])); }
}

export const KUN_TITLES = Object.fromEntries(
  Object.entries(PHRASES).map(([k, v]) => [k, v.title]));
