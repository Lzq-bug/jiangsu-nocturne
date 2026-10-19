import * as THREE from 'three';
import { BELL } from './data.js';
import * as T from './textures.js';

/**
 * 夜半钟：一次敲击同时驱动四件事——钟体摆动、贴水的声波环、渔火被压一口、
 * 栖鸦与落叶被震开。声音是 Web Audio 现合成的，没有外部音频文件。
 *
 * 梵钟的音列是不和谐的：除基音外还有小三度左右的"击音"与一串高倍分音，
 * 衰减各不同，所以用分音叠加而不是简单正弦。
 */
const PARTIALS = [
  { ratio: 1.00, gain: 1.00, decay: 7.4 },
  { ratio: 1.19, gain: 0.66, decay: 6.2 },
  { ratio: 2.02, gain: 0.34, decay: 4.6 },
  { ratio: 2.71, gain: 0.24, decay: 3.4 },
  { ratio: 3.06, gain: 0.17, decay: 2.8 },
  { ratio: 4.12, gain: 0.11, decay: 1.9 },
  { ratio: 5.42, gain: 0.07, decay: 1.2 },
];

class BellSound {
  constructor() {
    this.ctx = null;
    this.master = null;
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
    this.master.gain.value = 0.3;
    // 一点空间感：短延迟回馈，像寺院的墙把声音顶回来
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.23;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.24;
    const damp = this.ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    delay.connect(damp).connect(fb).connect(delay);
    delay.connect(this.master);
    const cut = this.ctx.createBiquadFilter();
    cut.type = 'lowpass';
    cut.frequency.value = 4200;
    cut.connect(this.master).connect(this.ctx.destination);
    this.voice = cut;
    return true;
  }
  /** 离得越远越轻，远处只剩一层嗡鸣 */
  setListener(dist) {
    this.distance = Math.max(0.1, Math.min(1, 1.45 - dist / 120));
  }
  strike(strength = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const amp = 0.55 * strength * this.distance;
    const f0 = 96.5;
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = p.ratio === 1 ? 'sine' : 'triangle';
      osc.frequency.value = f0 * p.ratio * (1 + (Math.random() * 0.004 - 0.002));
      const g = ctx.createGain();
      const peak = Math.max(0.0006, amp * p.gain * 0.5);
      g.gain.setValueAtTime(0.0004, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.00035, t + p.decay);
      osc.connect(g).connect(this.voice);
      osc.start(t);
      osc.stop(t + p.decay + 0.1);
      osc.onended = () => { try { g.disconnect(); osc.disconnect(); } catch (e) { /* ignore */ } };
    }
    // 撞木触钟的一记闷响
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.value = 0.5 * amp;
    noise.connect(bp).connect(ng).connect(this.master);
    noise.start(t);
    noise.onended = () => { try { ng.disconnect(); bp.disconnect(); } catch (e) { /* ignore */ } };
  }
}

export class MidnightBell {
  constructor({ tower, rings, props, env, position, onCount }) {
    this.tower = tower;
    this.rings = rings;
    this.props = props;
    this.env = env;
    this.pos = position.clone();
    this.onCount = onCount || (() => {});
    this.sound = new BellSound();
    this.count = 0;
    this.ringing = false;
    this.nextAt = 0;
    this.hits = [];
    this.pivotBase = tower.pivot.rotation.z;

    // 钟口的受光点：撞击瞬间在钟身泛起一圈暖光
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,214,150', 0.1), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.flash.material.toneMapped = false;
    this.flash.scale.setScalar(7);
    this.flash.position.copy(this.pos);
  }

  addFlashTo(scene) { scene.add(this.flash); }

  /** 一响 */
  strike(t, strength = 1) {
    this.hits.push({ t0: t, s: strength });
    if (this.hits.length > 6) this.hits.shift();
    this.sound.strike(strength);
    this.rings.emit(this.pos.x, this.pos.z, t, 0.85 + 0.15 * strength);
    if (this.props?.fleet) this.props.fleet.flare(1);
    if (this.props?.leaves) this.props.leaves.blow(this.pos.x, this.pos.z, 0.8);
    // 不是每一响都惊鸦，第七响起才陆续有鸟离枝
    if (this.count % 7 === 1 && this.env?.startle) this.env.startle(this.pos.x, this.pos.z, t);
    this.count++;
    this.onCount(this.count, this.ringing);
  }

  ring108(t) {
    this.ringing = true;
    this.count = 0;
    this.nextAt = t + 0.25;
    this.onCount(0, true);
  }
  stop() {
    this.ringing = false;
    this.onCount(this.count, false);
  }
  /** 手动敲一响：先停掉正在进行的整套，免得计数错乱 */
  one(t) {
    if (this.ringing) this.stop();
    this.count = 0;
    this.strike(t);
    this.onCount(this.count, false);
  }

  update(t, dt, camPos) {
    if (this.ringing && t >= this.nextAt) {
      this.strike(t, 1);
      this.nextAt += BELL.interval;
      if (this.count >= BELL.strikes) {
        this.ringing = false;
        this.onCount(this.count, false);
      }
    }
    if (camPos) {
      const d = camPos.distanceTo(this.pos);
      this.sound.setListener(d);
      // 钟口的可见度按距离给一点，远处不至于亮成一个点
      if (this.flash.material.opacity > 0.001) this.flash.scale.setScalar(6 + Math.min(10, d / 12));
    }
    // 钟体：每次敲击叠一个阻尼摆动，同相叠加就是连敲的效果
    let ang = 0, vel = 0, logAng = 0, glow = 0;
    for (const h of this.hits) {
      const age = t - h.t0;
      if (age < 0 || age > 6) continue;
      const env = Math.exp(-age / 1.9) * h.s;
      ang += env * 0.16 * Math.cos(age * 3.0);
      logAng -= env * 0.20 * Math.cos(age * 3.0 + 0.16);
      glow = Math.max(glow, env * Math.max(0, 1 - age * 3.2));
    }
    this.hits = this.hits.filter((h) => t - h.t0 < 6);
    const swing = Math.sin(t * 0.6) * 0.004;
    this.tower.pivot.rotation.z = this.pivotBase + ang + swing;
    this.tower.logPivot.rotation.z = logAng * 0.8 - swing * 0.5;
    this.tower.bellMesh.rotation.y += dt * Math.abs(ang) * 1.4;
    const m = this.flash.material;
    m.opacity += (glow * 0.85 - m.opacity) * Math.min(1, dt * 12);
  }
}
