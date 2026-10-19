import * as THREE from 'three';
import { CHIME, FACES } from './data.js';

/**
 * 慈寿塔风铎：八面七级共五十六枚铃，江风过境时一响一面。
 * 一响三件事——铃摆起来，一圈声纹自塔身推过水面与荻滩，那一面的檐下亮起来；
 * 灯串、香火、荻花跟着矮一口，江鸥与萤火被惊开。
 */
const PENTATONIC = [0, 2, 4, 7, 9];

export class Talu {
  constructor({ frame, rings, props, env, position, onCount }) {
    this.frame = frame;
    this.rings = rings;
    this.props = props;
    this.env = env;
    this.position = position.clone();
    this.onCount = onCount;
    this.hits = [];
    this.count = 0;
    this.ringing = false;
    this.queue = null;
    this.ctx = null;
    this.master = null;
    this.swing = 0;
    this.swingPhase = 0;
    this.bellJiggle = 0;
    this.faceLit = new Float32Array(FACES.length);
    this.dim = 0;
  }

  audio() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** 一枚风铎：基频加三个非谐波分音，尾音按余响长度衰减 */
  strike(freq, gain = 1) {
    const ctx = this.audio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    for (const [ratio, amp, dec] of [[1, 1, 1], [2.74, 0.52, 0.6], [5.1, 0.3, 0.38], [8.6, 0.15, 0.24]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = ratio === 1 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(freq * ratio, t);
      // 铃身受击后频率会轻微下坠，这是金属余响最像的地方
      o.frequency.exponentialRampToValueAtTime(freq * ratio * 0.996, t + CHIME.sustain * dec);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * 0.42, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + CHIME.sustain * dec);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + CHIME.sustain * dec + 0.05);
    }
    // 撞击的一记木声
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const dd = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 3.4; bp.Q.value = 1.3;
    const ng = ctx.createGain(); ng.gain.value = 0.3 * gain;
    src.connect(bp); bp.connect(ng); ng.connect(out);
    src.start(t);
  }

  /** 第 n 响（0 起）：沿五声音阶往上走，八响正好一轮 */
  note(n) {
    const oct = Math.floor(n / 5) % 2;
    return 330 * Math.pow(2, oct) * Math.pow(2, PENTATONIC[n % 5] / 12);
  }

  /** 点亮一面的檐下：面光材质每面一块，报这面时整面一起亮 */
  lightFace(i, k) {
    const mats = this.frame.faces || [];
    if (!mats.length) return;
    const m = mats[((i % mats.length) + mats.length) % mats.length];
    if (!m) return;
    m.color.copy(m.userData.base).multiplyScalar(0.22 + k * 1.5);
    this.faceLit[i % this.faceLit.length] = Math.max(this.faceLit[i % this.faceLit.length], k);
  }

  one(t, { amp = 1, index = null } = {}) {
    const n = index === null ? Math.floor(Math.random() * FACES.length) : index;
    const f = FACES[n % FACES.length];
    this.lastN = n;
    this.hits.push({ t0: t, s: amp });
    if (this.hits.length > 24) this.hits.shift();
    this.rings.emit(this.position.x, this.position.z, t, amp);
    this.props.reeds.wave(this.position.x, this.position.z, t, f.hue, amp);
    this.props.strings.wave(this.position.x, this.position.z, t, f.hue, amp);
    this.props.smoke.wave(this.position.x, this.position.z, t, f.hue, amp);
    this.props.smoke.blow(this.position.x, this.position.z, amp);
    this.env.startle(this.position.x, this.position.z);
    this.swing = Math.min(1.4, this.swing + 0.8 * amp);
    this.bellJiggle = 1;
    this.lightFace(n, amp);
    this.strike(this.note(n), 0.5 + 0.45 * amp);
    return f;
  }

  ringAll(t) {
    this.ringing = true;
    this.count = 0;
    this.queue = { next: t + 0.35, i: 0 };
    this.onCount(0, true, null);
  }

  stop() {
    this.ringing = false;
    this.queue = null;
    this.onCount(this.count, false, this.lastFace);
  }

  addFlashTo(scene) {
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 14, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6b8').multiplyScalar(2.6), transparent: true, opacity: 0, toneMapped: false, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.position.copy(this.position);
    scene.add(this.flash);
  }

  update(t, dt, camPos) {
    if (this.queue) {
      while (this.queue && t >= this.queue.next && this.queue.i < CHIME.strikes) {
        const f = this.one(this.queue.next, { amp: 0.92, index: this.queue.i });
        this.count = ++this.queue.i;
        this.lastFace = f;
        this.onCount(this.count, true, f);
        this.queue.next += CHIME.interval;
      }
      if (this.queue && this.queue.i >= CHIME.strikes) {
        this.ringing = false; this.queue = null;
        this.onCount(this.count, false, this.lastFace);
      }
    }
    // 距离衰减：离塔越远越轻，波环不看距离
    const dist = camPos.distanceTo(this.position);
    if (this.master) this.master.gain.value = 0.55 * THREE.MathUtils.clamp(150 / Math.max(45, dist), 0.15, 1);
    this.swing *= Math.exp(-dt * 1.15);
    this.swingPhase += dt * 2.5;
    if (this.frame && this.frame.pivot) {
      this.frame.pivot.rotation.x = Math.sin(this.swingPhase) * this.swing * 0.5;
      this.frame.pivot.rotation.z = Math.cos(this.swingPhase * 0.8) * this.swing * 0.2;
    }
    this.bellJiggle = Math.max(0, this.bellJiggle - dt * 0.5);
    if (this.frame && this.frame.bells) {
      for (const b of this.frame.bells) {
        if (!b.mesh) continue;
        b.mesh.rotation.z = Math.sin(t * 6.4 + (b.phase || 0)) * 0.12 * this.bellJiggle;
      }
    }
    // 面光退亮：一响之后慢慢收回底色
    const mats = this.frame.faces || [];
    for (let i = 0; i < this.faceLit.length; i++) {
      if (this.faceLit[i] <= 0.001) continue;
      this.faceLit[i] = Math.max(0, this.faceLit[i] - dt * 0.34);
      const m = mats[i];
      if (m) m.color.copy(m.userData.base).multiplyScalar(0.22 + this.faceLit[i] * 1.5);
    }
    if (this.flash) {
      const hit = this.hits[this.hits.length - 1];
      const age = hit ? t - hit.t0 : 99;
      this.flash.material.opacity = Math.max(0, 0.5 * Math.exp(-age * 2.8));
      const k = 1 + Math.min(7, age * 6.2);
      this.flash.scale.setScalar(k);
    }
    // 声纹扫过机位附近时把 dim 交出去，由 main.js 决定灯火矮多少
    let near = 0;
    for (const h of this.hits) {
      const age = t - h.t0;
      if (age < 0 || age > CHIME.sustain) continue;
      const front = age * 26;
      const d = camPos.distanceTo(this.position);
      near = Math.max(near, Math.exp(-Math.pow((d - front) / 24, 2)) * h.s * Math.exp(-age / CHIME.sustain));
    }
    this.dim = near;
  }
}
