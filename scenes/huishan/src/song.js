/**
 * 「引泉入池」：上池→中池→下池依次落水，月影最后落进下池。
 * 声音全部用 WebAudio 现合成（水滴 + 五声弹拨 + 一支拉弦的滑音），不带任何素材。
 * 曲调不是《二泉映月》本身——那首曲子的名字是 1950 年录音时才定下的，这里只取泉与月的意思。
 */

const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

export function createSong({ spring, onLanternWave, onMoonRise }) {
  let ctx = null;
  let bus = null;
  let playing = null;   // { t0, steps }
  let tail = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      bus = ctx.createGain();
      bus.gain.value = 0.5;
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 3200;
      shelf.gain.value = -6;
      bus.connect(shelf).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** 水滴：下滑的正弦 + 一小撮噪声 */
  function drop(when, f0 = 880, dur = 0.34, gain = 0.5) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.38, when + dur * 0.5);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(bus);
    o.start(when);
    o.stop(when + dur + 0.02);
    // 溅起的高频
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    n.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = gain * 0.22;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    n.connect(hp).connect(ng).connect(bus);
    n.start(when);
  }

  /** 弹拨：一段五声音阶的拨弦，带一点琴弦的阻尼 */
  function pluck(when, freq, dur = 1.5, gain = 0.3) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o2.type = 'sine';
    o.frequency.value = freq;
    o2.frequency.value = freq * 2.006;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    o2.connect(g);
    g.connect(bus);
    o.start(when); o2.start(when);
    o.stop(when + dur + 0.02); o2.stop(when + dur + 0.02);
  }

  /** 拉弦：一条慢慢滑上去的长音，是"弓弦"而不是"拨"的意思 */
  function bowed(when, f0, f1, dur, gain = 0.22) {
    const o = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1900;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.linearRampToValueAtTime(f1, when + dur * 0.62);
    o.frequency.linearRampToValueAtTime(f1 * 0.97, when + dur);
    vib.frequency.value = 5.4;
    vg.gain.value = f0 * 0.012;
    vib.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + dur * 0.22);
    g.gain.setValueAtTime(gain, when + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    o.connect(lp).connect(g).connect(bus);
    o.start(when); vib.start(when);
    o.stop(when + dur + 0.05); vib.stop(when + dur + 0.05);
  }

  /** 一遍完整的"引泉入池"，约 11 秒 */
  function play() {
    if (!ensure()) return false;
    const t = ctx.currentTime + 0.08;
    // 三池依次落水，音高由高到低、间隔越来越宽
    drop(t, 1180, 0.3, 0.42);
    drop(t + 1.05, 880, 0.34, 0.4);
    drop(t + 2.35, 620, 0.42, 0.46);
    // 水满之后是五声的拨弦，像泉眼透上来的一串泡
    [0, 2, 1, 4, 3, 5].forEach((k, i) => pluck(t + 3.4 + i * 0.42, PENTA[k], 1.5, 0.24));
    // 最后一条拉弦的滑音收在羽音上
    bowed(t + 6.4, 392, 440, 3.6, 0.2);
    bowed(t + 7.6, 261.63, 293.66, 3.2, 0.14);
    playing = { t0: t, end: t + 11.2 };
    // 画面跟着水走
    spring.pulse(0, 0);
    spring.pulse(1, 1.05);
    spring.pulse(2, 2.35);
    onMoonRise && onMoonRise(3.4);
    onLanternWave && onLanternWave(3.4);
    return true;
  }

  /** 每帧把时间进度喂回视觉模块 */
  function update(now) {
    if (!playing) return 0;
    const k = (now - playing.t0) / (playing.end - playing.t0);
    if (k >= 1) { playing = null; return 0; }
    return Math.max(0, k);
  }

  return {
    play,
    update,
    get playing() { return !!playing; },
    get startAt() { return playing ? playing.t0 : 0; },
    stop() { if (ctx) { tail = ctx.currentTime; } },
  };
}
