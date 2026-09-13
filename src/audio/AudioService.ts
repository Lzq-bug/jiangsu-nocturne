/**
 * AudioService · 程序化音频三总线（master / bgm / sfx）
 * 设计思想迁移自原 Demo audio-manager（审计 KEEP 项）：零外部素材、Web Audio 合成、
 * ducking、节流。重写为轻量单例，供 React 层调用；未解锁前静默无副作用。
 */

type SfxName =
  | 'click' | 'hover' | 'catch' | 'gold' | 'miss'
  | 'unseal' | 'reveal' | 'newCard' | 'error' | 'settle';

class AudioService {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgm!: GainNode;
  private sfx!: GainNode;
  private lastPlay = new Map<string, number>();

  private vol = { master: 0.8, bgm: 0.5, sfx: 0.8, muted: false };
  private bgmNodes: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

  /** 需在用户手势内调用一次 */
  unlock(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.bgm = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.bgm.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: { master?: number; bgm?: number; sfx?: number; muted?: boolean }): void {
    if (v.master !== undefined) this.vol.master = clamp01(v.master);
    if (v.bgm !== undefined) this.vol.bgm = clamp01(v.bgm);
    if (v.sfx !== undefined) this.vol.sfx = clamp01(v.sfx);
    if (v.muted !== undefined) this.vol.muted = v.muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const m = this.vol.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.bgm.gain.setTargetAtTime(this.vol.bgm * 0.5, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx * 0.9, this.ctx.currentTime, 0.05);
  }

  /** 低沉的星空氛围垫（两个失谐正弦 + 缓慢 LFO），可重复调用幂等 */
  startAmbient(): void {
    this.unlock();
    if (!this.ctx || this.bgmNodes) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bgm);
    const oscs: OscillatorNode[] = [];
    for (const [freq, detune] of [[110, 0], [110.7, 4], [220.5, -5]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = freq > 200 ? 0.06 : 0.22;
      o.connect(g).connect(gain);
      o.start();
      oscs.push(o);
    }
    // 缓慢呼吸
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    oscs.push(lfo);
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
    this.bgmNodes = { oscs, gain };
  }

  stopAmbient(): void {
    if (!this.ctx || !this.bgmNodes) return;
    const { oscs, gain } = this.bgmNodes;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
    const stopAt = this.ctx.currentTime + 2.5;
    for (const o of oscs) o.stop(stopAt);
    this.bgmNodes = null;
  }

  /** 短音效（合成） */
  play(name: SfxName): void {
    this.unlock();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // 节流：同名 60ms 内不重复
    const last = this.lastPlay.get(name) ?? 0;
    if (performance.now() - last < 60) return;
    this.lastPlay.set(name, performance.now());

    const tone = (freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number, delay = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      const t0 = now + delay;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(this.sfx);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    };

    switch (name) {
      case 'click': tone(660, 0.08, 'sine', 0.25); break;
      case 'hover': tone(880, 0.04, 'sine', 0.08); break;
      case 'catch': tone(1180, 0.09, 'triangle', 0.3, 1560); break;
      case 'gold': tone(1560, 0.16, 'triangle', 0.34, 2080); tone(2340, 0.2, 'sine', 0.16, 3120, 0.05); break;
      case 'miss': tone(220, 0.12, 'sine', 0.12, 160); break;
      case 'unseal': tone(196, 0.5, 'sine', 0.3, 98); tone(392, 0.4, 'triangle', 0.14, 294, 0.06); break;
      case 'reveal': tone(523, 0.14, 'triangle', 0.28, 784); tone(1046, 0.22, 'sine', 0.12, 1318, 0.1); break;
      case 'newCard':
        tone(523, 0.16, 'triangle', 0.26, 659, 0);
        tone(659, 0.16, 'triangle', 0.26, 784, 0.14);
        tone(784, 0.3, 'sine', 0.22, 1046, 0.28);
        break;
      case 'error': tone(180, 0.16, 'square', 0.1, 120); break;
      case 'settle': tone(392, 0.3, 'sine', 0.2, 523); tone(523, 0.35, 'triangle', 0.14, 659, 0.12); break;
    }
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export const audio = new AudioService();
export type { SfxName };
