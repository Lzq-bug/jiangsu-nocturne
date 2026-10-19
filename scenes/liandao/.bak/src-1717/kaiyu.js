import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';
import { CHIME, WATCH_TONES } from './data.js';
import { LIGHTHOUSE } from './layout.js';

/**
 * 一夜五更潮信。
 * 一响三件事——灯塔气笛一声，一圈潮信自灯脚推过港池与海湾，
 * 灯串染色、鸥鸟惊起、泊船的桅灯跟着一晃；堤灯在波前扫过相机时矮一口。
 * 五响之后潮位转到涨口，第五更的余响散尽就是开渔信号（onRelease → 船队解缆）。
 *
 * 音高不走随机：一更到五更取 data.WATCH_TONES 的 semitone（宫商角徵羽五声），
 * 手动报更（B 键 / 点灯芯）沿同一个游标往下走，一夜听下来是一条 ascending 的线。
 */

/** 潮信波前的推进速度（米/秒）：与 water.js 的 uWaveSpeed 同量级，dim 只认这个数 */
const RING_SPEED = 30;
/** 气笛基频（Hz）：低到像一座混凝土塔里的气柱，再按更点往上走 */
const HORN_F0 = 96;
/** 扫光锥：塔灯 6 秒一转，锥长与锥底半径 */
const BEAM_LEN = 54;
const BEAM_R = 8.6;

export class Kaiyu {
  constructor({ frame, rings, props, env, position, onCount, onRelease }) {
    this.frame = frame || null;
    this.rings = rings;
    this.props = props;
    this.env = env;
    this.position = position && position.isVector3 ? position.clone() : new THREE.Vector3(LIGHTHOUSE.x, LIGHTHOUSE.focal, LIGHTHOUSE.z);
    this.onCount = onCount || (() => {});
    this.onRelease = onRelease || (() => {});

    /** 每一响留一个记号：波环、灯串、dim 都按它算 */
    this.hits = [];
    /** 本轮已报的更数（0 起算，报满五更到 5） */
    this.count = 0;
    this.ringing = false;
    /** 波前扫过相机附近的程度，0~1，交给 main.js 决定堤灯矮多少 */
    this.dim = 0;

    this.cursor = 0;
    this.queue = null;
    this.releaseAt = null;
    this.lastWatch = null;

    this.ctx = null;
    this.master = null;
    this.voices = [];
    this.noise = null;
    this.armAudio();

    /** 一记推力：灯芯、塔身、泊船横摇共用同一个衰减量 */
    this.kick = 0;
    this.ringSpeed = Number.isFinite(rings && rings.speed) && rings.speed > 0 ? rings.speed : RING_SPEED;
    this.phase = LIGHTHOUSE.phase || 6;
    this.lampAt = this.position.clone();
    this.flash = null;
  }

  /* ---------------------------------------------------------------- 音频 */

  /**
   * ctx 只在真要出声时创建。浏览器的自动播放策略要求手势之后才 resume，
   * 所以这里额外挂一次性的 pointerdown/keydown 监听把它唤醒。
   */
  audio() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  armAudio() {
    if (typeof window === 'undefined') return;
    const wake = () => {
      if (this.ctx && this.ctx.state !== 'running') this.resume();
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  resume() {
    try {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 没有手势就先不响，等下一次点击 */ }
  }

  /** 一段确定性白噪：只用 kit.rand 播种，绝不碰 Math.random */
  noiseBuf() {
    if (this.noise) return this.noise;
    const ctx = this.audio();
    if (!ctx) return null;
    const len = Math.floor(ctx.sampleRate * 1.9);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = (rand() * 4294967296) | 0 || 20240901;
    for (let i = 0; i < len; i++) {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5; s |= 0;
      d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }
    this.noise = buf;
    return buf;
  }

  /**
   * 一记汽笛/雾号，三段叠出来：
   * 气柱 = 锯齿 + 三角的三条不平行支（含低八度），慢攻 0.16 秒、起振略低再抬上来；
   * 金属 = 四下非谐波分音的一记脆响，是铜号口与塔身共振的那一口；
   * 风 = 带通噪声的 swelling，管口的气感全在这里。
   */
  horn(freq, gain = 1) {
    const ctx = this.audio();
    if (!ctx) return;
    if (ctx.state !== 'running') this.resume();
    const t = ctx.currentTime;
    const attack = 0.17, hold = 1.15, tail = CHIME.sustain * 0.62;
    const end = attack + hold + tail;

    const out = ctx.createGain();
    out.gain.setValueAtTime(gain * 0.9, t);
    out.connect(this.master);

    // —— 气柱：先闷后亮，低通跟着包络走一遍
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3.4;
    lp.frequency.setValueAtTime(freq * 1.5, t);
    lp.frequency.linearRampToValueAtTime(freq * 7.2, t + attack);
    lp.frequency.linearRampToValueAtTime(freq * 2.4, t + attack + hold);
    lp.frequency.linearRampToValueAtTime(freq * 1.6, t + end);
    lp.connect(out);

    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(0.6, t + attack);
    body.gain.setValueAtTime(0.6, t + attack + hold);
    body.gain.exponentialRampToValueAtTime(0.0001, t + end);
    body.connect(lp);

    const nodes = [];
    for (const [ratio, amp, det] of [[0.5, 0.6, -7], [1, 1, 0], [2, 0.34, 6]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = ratio === 2 ? 'triangle' : 'sawtooth';
      o.detune.value = det;
      // 气柱起振时音高是"喘"上来的，尾音再坠回去一点——雾号最像这两下
      o.frequency.setValueAtTime(freq * ratio * 0.95, t);
      o.frequency.linearRampToValueAtTime(freq * ratio, t + attack);
      o.frequency.linearRampToValueAtTime(freq * ratio * 0.985, t + end);
      g.gain.value = amp;
      o.connect(g); g.connect(body);
      o.start(t); o.stop(t + end + 0.1);
      nodes.push(o);
    }

    // —— 金属：非谐波分音，短促的一记，号口与铸铁的声音
    for (const [ratio, amp, dec] of [[4.0, 0.16, 1.0], [9.2, 0.09, 0.55], [15.4, 0.05, 0.32], [22.1, 0.03, 0.2]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * ratio, t);
      o.frequency.exponentialRampToValueAtTime(freq * ratio * 0.992, t + dec);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dec + 0.05);
      nodes.push(o);
    }

    // —— 风：带通噪声随包络涌一下再散
    const buf = this.noiseBuf();
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.92;
      src.start(t, rand() * 0.9);
      src.stop(t + attack + hold + 0.2);
      nodes.push(src);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq * 2.1, t);
      bp.frequency.linearRampToValueAtTime(freq * 3.6, t + attack);
      bp.Q.value = 0.85;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.16 * gain, t + attack * 0.8);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold);
      src.connect(bp); bp.connect(ng); ng.connect(out);
    }

    this.voices.push({ out, nodes, end: t + end });
  }

  /* ---------------------------------------------------------------- 报更 */

  /** 第 i 更的频率：五声音阶按 WATCH_TONES 的 semitone 走 */
  freqAt(i) {
    const tone = WATCH_TONES[i] || WATCH_TONES[0];
    return HORN_F0 * Math.pow(2, (tone.semitone || 0) / 12);
  }

  /** 报一更：声、波环、灯串、鸥鸟、桅灯一起走 */
  one(t, { amp = 1, index = null } = {}) {
    const i = (((index === null ? this.cursor : index) % 5) + 5) % 5;
    this.cursor = (i + 1) % 5;
    const tone = WATCH_TONES[i];

    this.hits.push({ t0: t, s: amp });
    if (this.hits.length > 24) this.hits.shift();

    if (this.rings && this.rings.emit) this.rings.emit(this.position.x, this.position.z, t, amp);
    if (this.props && this.props.strings && this.props.strings.wave) {
      this.props.strings.wave(this.position.x, this.position.z, t, tone.hue, amp);
    }
    if (this.env && this.env.startle) this.env.startle(this.position.x, this.position.z);

    this.kick = Math.min(1.5, this.kick + 0.9 * amp);
    this.horn(this.freqAt(i), 0.5 + 0.5 * amp);
    this.lastWatch = tone;
    return tone;
  }

  /** 轮满五更：按 CHIME.interval 连报，第五更的余响散尽再放开船 */
  ringAll(t) {
    this.ringing = true;
    this.count = 0;
    this.cursor = 0;
    this.queue = { next: t + 0.4, i: 0 };
    this.releaseAt = null;
    this.onCount(0, true, null);
  }

  /** 止声：已经推出去的波环不归它管，让它自己在水面上衰减完 */
  stop() {
    this.ringing = false;
    this.queue = null;
    this.releaseAt = null;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const v of this.voices) {
        try {
          const g = v.out.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(Math.max(0.0001, g.value), now);
          g.exponentialRampToValueAtTime(0.0001, now + 0.3);
          for (const n of v.nodes) { try { n.stop(now + 0.34); } catch (e) { /* 已经停了 */ } }
        } catch (e) { /* 节点可能已被回收 */ }
      }
      this.voices = [];
    }
    this.onCount(this.count, false, this.lastWatch);
  }

  /* -------------------------------------------------------------- 灯塔扫光 */

  /**
   * 六秒一转的扫光：一根旋转的加性锥 + 灯芯 + 水面上一条来回的高光。
   * 灯芯同时是可点的东西——main.js 的 tap 射线读 quarter.chime.lamps，
   * 那份数组就是契约 §5 的 LAYOUT.chime.lamps，点得到它就报一更。
   */
  addFlashTo(scene) {
    // 声源记在哪儿就信哪儿，但扫光必须架在灯位上：D 组若把 chime.pos 落在塔底，这里抬回 focal
    this.lampAt = this.position.clone();
    if (this.lampAt.y < LIGHTHOUSE.focal - 4) this.lampAt.y = LIGHTHOUSE.focal;

    const grp = new THREE.Group();
    grp.position.copy(this.lampAt);
    scene.add(grp);

    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffeec6').multiplyScalar(1.5),
      vertexColors: true, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    const beam = new THREE.Mesh(beamGeo(BEAM_LEN, BEAM_R), beamMat);
    beam.rotation.x = 0.085;          // 略微俯下去，光柱才拍得到水面
    beam.renderOrder = 12;
    grp.add(beam);

    // 灯芯：亮到能吃住 bloom 的一颗，加一层薄纱把点击目标放大
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 10), glow('#fff3d0', 3.6));
    const veil = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe8bd').multiplyScalar(1.1), transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,238,198', 0.14), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.material.toneMapped = false;
    halo.scale.setScalar(11);
    grp.add(core, veil, halo);

    // 水面高光：跟着光柱的方位角在港池与湾口上来回扫一遍
    const streak = new THREE.Group();
    streak.position.set(this.lampAt.x, 0.05, this.lampAt.z);   // 平均海面，潮差 ±1.65 米落在高光自身的软边里
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(9, 46), new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffe3ae').multiplyScalar(1.35), map: T.softGlow('255,226,176', 0.1),
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.z = 26;
    strip.renderOrder = 11;
    streak.add(strip);
    scene.add(streak);

    this.flash = { grp, beam, beamMat, core, veil, halo, streak, strip };
    this.registerLamps([core, veil]);
    return this.flash;
  }

  /** 把灯芯挂进声源灯组：D 组若已给出 lamps 就追加，没有就自己建一份 */
  registerLamps(meshes) {
    const f = this.frame;
    if (!f) { this.lamps = meshes.slice(); return; }
    if (!Array.isArray(f.lamps)) f.lamps = [];
    for (const m of meshes) if (!f.lamps.includes(m)) f.lamps.push(m);
  }

  /* ---------------------------------------------------------------- 每帧 */

  update(t, dt, camPos) {
    // —— 排期：连报五更，末了放船
    if (this.queue) {
      while (this.queue && t >= this.queue.next && this.queue.i < CHIME.strikes) {
        const w = this.one(this.queue.next, { amp: 0.82 + this.queue.i * 0.045, index: this.queue.i });
        this.count = ++this.queue.i;
        this.onCount(this.count, true, w);
        this.queue.next += CHIME.interval;
        if (this.queue.i >= CHIME.strikes) this.releaseAt = this.queue.next - CHIME.interval + CHIME.sustain * 0.62;
      }
      if (this.releaseAt !== null && t >= this.releaseAt) {
        this.ringing = false;
        this.queue = null;
        this.releaseAt = null;
        this.onCount(this.count, false, this.lastWatch);
        this.onRelease();
      }
    }

    // —— 距离衰减：离塔越远越轻，波环不看距离
    const dist = camPos.distanceTo(this.position);
    if (this.master) this.master.gain.value = 0.55 * THREE.MathUtils.clamp(150 / Math.max(45, dist), 0.12, 1);
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end < now) this.voices.splice(i, 1);
    }

    // —— 一记推力的衰减：塔身微颤、灯组一亮、泊船一晃
    this.kick *= Math.exp(-dt * 1.35);
    const jig = this.kick;
    if (this.frame && this.frame.pivot && this.frame.pivot.isObject3D) {
      const p = this.frame.pivot;
      if (jig > 0.004) {
        p.rotation.x = Math.sin(t * 15.5) * 0.0075 * jig;
        p.rotation.z = Math.cos(t * 12.3) * 0.006 * jig;
      } else if (p.rotation.x || p.rotation.z) {
        p.rotation.x = p.rotation.z = 0;
      }
    }
    const lamps = (this.frame && Array.isArray(this.frame.lamps)) ? this.frame.lamps : (this.lamps || []);
    for (const m of lamps) {
      if (!m || !m.isObject3D) continue;
      if (m.userData.__s0 === undefined) m.userData.__s0 = m.scale.x || 1;
      m.scale.setScalar(m.userData.__s0 * (1 + 0.11 * jig * Math.abs(Math.sin(t * 9))));
    }
    this.nudgeFleet(t, jig);

    // —— 波前扫过相机附近就把 dim 交出去
    let near = 0;
    for (const h of this.hits) {
      const age = t - h.t0;
      if (age < 0 || age > CHIME.sustain) continue;
      const front = age * this.ringSpeed;
      near = Math.max(near, Math.exp(-Math.pow((dist - front) / 26, 2)) * h.s * Math.exp(-age / CHIME.sustain));
    }
    this.dim = near;

    if (this.flash) this.updateFlash(t, camPos, jig);
  }

  /**
   * 扫光：六秒一转，转过去时在水面拖一道来回的高光。
   * 与 dim 的耦合在这里——潮信推开时堤灯矮一口，但气柱把那口气是吹进灯芯的，
   * 所以每一响灯芯 flare 一下、光锥反而更亮一点，暗的是岸上的灯，不是这座塔。
   */
  updateFlash(t, camPos, jig) {
    const f = this.flash;
    const lamp = this.lampAt || this.position;
    const az = (t / this.phase) * Math.PI * 2;
    f.grp.rotation.y = az;
    f.streak.rotation.y = az;

    // 灯在灯室里时那根大锥会把画面糊掉，靠得越近越收掉
    const dl = camPos.distanceTo(lamp);
    const nearFade = THREE.MathUtils.clamp((dl - 5) / 14, 0, 1);
    const flare = Math.min(1, jig * 1.25);
    const gain = (0.82 + 0.5 * this.dim) * (0.85 + 0.6 * flare);
    f.beamMat.opacity = 0.3 * gain * nearFade;
    f.strip.material.opacity = 0.52 * gain * nearFade;

    // 高光只在光柱朝向相机那一侧时最亮，回头那一面就薄下去
    const toCam = new THREE.Vector3(camPos.x - lamp.x, 0, camPos.z - lamp.z);
    if (toCam.lengthSq() > 1e-4) {
      toCam.normalize();
      const facing = toCam.x * Math.sin(az) + toCam.z * Math.cos(az);
      const k = THREE.MathUtils.clamp(facing, 0, 1);
      f.strip.material.opacity *= 0.3 + 0.7 * k * k;
      f.streak.visible = f.beamMat.opacity > 0.02;
    }
    f.halo.material.opacity = 0.45 * nearFade + 0.5 * flare;
    f.halo.scale.setScalar(10 + 3.6 * flare);
    f.veil.material.opacity = 0.16 + 0.3 * flare;
  }

  /**
   * 桅灯一晃：props.fleet.update 每帧重设船的姿态，且它跑在我们之前，
   * 所以这里叠上去的一点点横摇只活一帧，不会积累成越摇越大。
   */
  nudgeFleet(t, jig) {
    if (jig < 0.02) return;
    const boats = this.props && this.props.fleet && this.props.fleet.boats;
    if (!Array.isArray(boats)) return;
    const n = Math.min(boats.length, 64);
    for (let i = 0; i < n; i++) {
      const rec = boats[i];
      const o = rec && rec.isObject3D ? rec : (rec && rec.obj);
      if (!o || !o.isObject3D) continue;
      const ph = (rec.phase !== undefined ? rec.phase : i * 0.73) + i;
      o.rotation.z += Math.sin(t * 5.4 + ph) * 0.032 * jig;
      o.rotation.x += Math.cos(t * 4.1 + ph) * 0.022 * jig;
    }
  }
}

/** 光锥：顶点在灯口，沿 +Z 摊开；顶点色沿锥长压暗，加性混合下就是一条渐隐的光柱 */
function beamGeo(len, r) {
  const g = new THREE.ConeGeometry(r, len, 22, 1, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, len / 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = THREE.MathUtils.clamp(p.getZ(i) / len, 0, 1);
    const f = 0.12 + 0.88 * Math.pow(1 - k, 1.7);
    col[i * 3] = f;
    col[i * 3 + 1] = f * 0.96;
    col[i * 3 + 2] = f * 0.84;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
