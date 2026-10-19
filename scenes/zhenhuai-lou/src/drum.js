import * as THREE from 'three';
import { DRUM } from './data.js';
import * as T from './textures.js';

/**
 * 谯楼更鼓：一记敲击同时驱动鼓皮凹陷、鼓槌荡回、贴渠的声波环、船火压一口、
 * 流萤散一片、栖鸦离枝。声音全部由 Web Audio 现场合成，没有外部音频文件。
 *
 * 蒙皮鼓的频谱比钟"脏"：基音在击打瞬间往下滑，膜式分音彼此不谐和，
 * 再加一记高频的槌头拍皮声，所以分音叠加之外还要一段带通噪声。
 */
const PARTIALS = [
  { ratio: 1.00, gain: 1.00, decay: 1.5, slide: 0.42 },
  { ratio: 1.52, gain: 0.52, decay: 0.9 },
  { ratio: 2.31, gain: 0.34, decay: 0.62 },
  { ratio: 3.18, gain: 0.2, decay: 0.4 },
  { ratio: 4.62, gain: 0.11, decay: 0.26 },
];

class DrumSound {
  constructor() {
    this.ctx = null;
    this.distance = 1;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch (e) {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.34;
    // 城砖洞里的回响：短延迟回馈，像在券门里被砖壁顶了一下
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.15;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.3;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    delay.connect(damp).connect(fb).connect(delay);
    delay.connect(this.master);
    const cut = this.ctx.createBiquadFilter();
    cut.type = 'lowpass';
    cut.frequency.value = 5200;
    cut.connect(this.master).connect(this.ctx.destination);
    this.voice = cut;
    return true;
  }
  /** 离得越远越只剩一记闷响 */
  setListener(dist) {
    this.distance = Math.max(0.1, Math.min(1, 1.5 - dist / 110));
  }
  /** 一记鼓：基音下滑 + 膜式分音 + 槌头拍皮 */
  beat(strength = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const amp = 0.62 * strength * this.distance;
    const f0 = 61;
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = p.ratio === 1 ? 'sine' : 'triangle';
      const peak = f0 * p.ratio;
      osc.frequency.setValueAtTime(peak * (p.slide ? 1.5 : 1), t);
      if (p.slide) osc.frequency.exponentialRampToValueAtTime(peak, t + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0006, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0008, amp * p.gain), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0004, t + p.decay);
      osc.connect(g).connect(this.voice);
      osc.start(t);
      osc.stop(t + p.decay + 0.08);
      osc.onended = () => { try { g.disconnect(); osc.disconnect(); } catch (e) { /* ignore */ } };
    }
    this.slap(amp, 1.0, 0.11);
  }
  /** 一记木柝：梆子那种又短又干的响，报完一更敲一下 */
  knock(strength = 1) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const amp = 0.5 * strength * this.distance;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(920, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0004, t);
    g.gain.linearRampToValueAtTime(amp * 0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.22);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 3.2;
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
    osc.onended = () => { try { osc.disconnect(); bp.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
    this.slap(amp * 0.7, 2.6, 0.05);
  }
  /** 拍皮的宽带瞬态：噪声短促衰减，套一层带通决定它有多"亮" */
  slap(amp, mul = 1, len = 0.12) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    const samples = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 3);
    n.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480 * mul;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = amp * 0.55;
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    n.onended = () => { try { n.disconnect(); bp.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
  }
}

const ROUND_NAME = ['一更', '二更', '三更', '四更', '五更'];

export class NightDrum {
  constructor({ drum, rings, props, env, position, onCount }) {
    this.drum = drum;
    this.rings = rings;
    this.props = props;
    this.env = env;
    this.pos = position.clone();
    this.onCount = onCount || (() => {});
    this.sound = new DrumSound();
    this.count = 0;
    this.round = 0;
    this.ringing = false;
    this.nextAt = 0;
    this.hits = [];
    this.pivotBase = drum.pivot.rotation.z;

    // 鼓心的受光点：皮被击中的那一瞬泛出一圈暖光
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,214,150', 0.1), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.flash.material.toneMapped = false;
    this.flash.scale.setScalar(3.4);
    this.flash.position.copy(this.pos);
  }

  addFlashTo(scene) { scene.add(this.flash); }

  /** 一记 */
  strike(t, strength = 1) {
    this.hits.push({ t0: t, s: strength });
    if (this.hits.length > 8) this.hits.shift();
    this.sound.beat(strength);
    this.rings.emit(this.pos.x, this.pos.z, t, 0.8 + 0.2 * strength);
    if (this.props?.fleet) this.props.fleet.flare(1);
    if (this.props?.flies) this.props.flies.scatter(this.pos.x, this.pos.z, 0.9);
    // 不是每一记都惊鸦，攒到整更才有一只离枝
    if (this.count % DRUM.perRound === 0 && this.env?.startle) this.env.startle(this.pos.x, this.pos.z, t);
    this.count++;
    this.onCount(this.count, this.ringing, this.round);
  }

  /** 报完一夜五更 */
  report(t) {
    this.ringing = true;
    this.count = 0;
    this.round = 0;
    this.nextAt = t + 0.3;
    this.onCount(0, true, 0);
  }
  stop() {
    this.ringing = false;
    this.onCount(this.count, false, this.round);
  }
  /** 手动一记：先停掉正在报的更，免得计数错乱 */
  one(t) {
    if (this.ringing) this.stop();
    this.count = 0;
    this.round = 0;
    this.strike(t);
    this.onCount(this.count, false, this.round);
  }

  update(t, dt, camPos) {
    if (this.ringing && t >= this.nextAt) {
      const within = this.count % DRUM.perRound;
      if (within === 0 && this.count > 0) {
        // 一更打毕：一记梆子，再歇一歇才起下一更
        this.sound.knock(1);
        this.round = Math.min(DRUM.rounds - 1, this.round + 1);
        this.nextAt = t + DRUM.roundGap;
        this.onCount(this.count, true, this.round);
      } else {
        this.strike(t, 1);
        this.nextAt = t + DRUM.interval;
      }
      if (this.count >= DRUM.strikes) {
        this.ringing = false;
        this.onCount(this.count, false, this.round);
      }
    }
    if (camPos) {
      const d = camPos.distanceTo(this.pos);
      this.sound.setListener(d);
      if (this.flash.material.opacity > 0.001) this.flash.scale.setScalar(2.6 + Math.min(7, d / 14));
    }
    // 鼓皮与鼓槌：每记叠一个阻尼摆动，连打就是皮面一直在颤
    let ang = 0, flex = 0, glow = 0;
    for (const h of this.hits) {
      const age = t - h.t0;
      if (age < 0 || age > 4) continue;
      const e = Math.exp(-age / 1.15) * h.s;
      ang += e * 0.075 * Math.cos(age * 9.0);
      flex += e * Math.max(0, 1 - age * 7.5);
      glow = Math.max(glow, e * Math.max(0, 1 - age * 4.5));
    }
    this.hits = this.hits.filter((h) => t - h.t0 < 4);
    this.drum.pivot.rotation.z = this.pivotBase + ang * 0.4;
    for (const hd of this.drum.heads) hd.scale.setScalar(0.98 - flex * 0.07);
    for (let i = 0; i < this.drum.mallets.length; i++) {
      const m = this.drum.mallets[i];
      m.rotation.x = -0.15 - ang * (i === 0 ? 1.6 : 1.2) + Math.sin(t * 0.7 + i) * 0.012;
    }
    const fm = this.flash.material;
    fm.opacity += (glow * 0.9 - fm.opacity) * Math.min(1, dt * 14);
  }
}

export { ROUND_NAME };
