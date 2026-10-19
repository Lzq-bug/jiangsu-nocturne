import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const shortestAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

/** 落到机位时用的默认视野角（全景模式） */
const PANO_FOV = 58;
/** 连岛范围：西堤外墟沟 x=-1750 到羊窝头 x=780，南到外海 z=1400，北到云台山 z=-1500 */
const BOUNDS = { x0: -1750, x1: 780, y0: 1.6, y1: 320, z0: -1500, z1: 1400 };

/**
 * 一台相机两种行为，共用一条代码路径：
 *  pano — 眼睛坐在机位上，拖动只转头（360° 环视），滚轮改视野角
 *  free — 围绕场景轨道、推拉、平移
 * 机位由 main.js 通过 goTo / goToOrbit 送进来；nudge 是全景模式下右键平移视点。
 */
export class CameraRig {
  constructor(camera, el) {
    this.camera = camera;
    this.el = el;
    this.mode = 'pano';

    this.pos = new THREE.Vector3(-60, 2.4, 120);
    this.yaw = 0;
    this.pitch = -0.1;
    this.fov = 60;

    this.target = new THREE.Vector3(-200, 4, 40);
    this.dist = 220;
    this.theta = 0.4;
    this.phi = 1.16;

    this.vYaw = 0; this.vPitch = 0; this.vTheta = 0; this.vPhi = 0;
    this.autoRotate = false;
    this.idle = 0;
    this.travel = null;
    this.pointers = new Map();
    this.pinchStart = 0;
    this.dragging = false;
    this.keys = new Set();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.onTravelEnd = null;
    /** 点击热点/门环的回调，由 main.js 的 bindTap 挂上 */
    this.onTap = null;

    this._bind();
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      // 指针可能在我们听说它之前就已经走了；丢掉捕获不能把拖动本身也丢掉
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      this.pinchStart = 0;
      this.dragging = true;
      this.travel = null;
      this.idle = 0;
      el.classList.add('dragging');
      this.lastTap = { t: performance.now(), x: e.clientX, y: e.clientY, moved: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.lastTap) this.lastTap.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchStart) {
          const k = this.pinchStart / d;
          if (this.mode === 'pano') this.setFov(this.fov * k);
          else this.setDist(this.dist * k);
        }
        this.pinchStart = d;
        return;
      }
      const pan = e.button === 2 || e.shiftKey;
      if (this.mode === 'pano' && !pan) {
        // 海面上没有参照物，转头速度调得比陆地场景略慢一点
        this.vYaw -= dx * 0.0024;
        this.vPitch -= dy * 0.002;
      } else if (this.mode === 'pano' && pan) {
        this.nudge(dx, dy);
      } else if (!pan) {
        this.vTheta -= dx * 0.0042;
        this.vPhi -= dy * 0.0034;
      } else {
        const s = this.dist * 0.0016;
        const r = panRight(this.camera, 1), u = panUp(this.camera, 1);
        this.target.addScaledVector(r, -dx * s).addScaledVector(u, dy * s);
      }
      this.idle = 0;
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.pinchStart = 0;
        el.classList.remove('dragging');
        const tap = this.lastTap;
        this.lastTap = null;
        if (tap && tap.moved < 9 && performance.now() - tap.t < 600 && this.onTap) {
          this.onTap({ x: e.clientX, y: e.clientY });
        }
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * 0.0011);
      if (this.mode === 'pano') this.setFov(this.fov * k);
      else this.setDist(this.dist * k);
      this.idle = 0;
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  setFov(v) {
    this.fov = clamp(v, 24, 100);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
  /** 场景压到约 1.5 公里，推拉范围要够得着云台山那条远景脊 */
  setDist(v) { this.dist = clamp(v, 5, 1500); }

  /** 由机位朝向反解 yaw/pitch；look 是眼睛瞄准的那一点 */
  poseFor(pos, look) {
    const v = new THREE.Vector3(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]);
    const yaw = Math.atan2(-v.x, -v.z);
    const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
    return { yaw, pitch };
  }

  goTo(pos, look, { animate = true, seconds = 1.5 } = {}) {
    const p = new THREE.Vector3(...pos);
    const { yaw, pitch } = this.poseFor(pos, look);
    if (!animate) {
      this.pos.copy(p);
      this.yaw = yaw; this.pitch = pitch;
      this.vYaw = this.vPitch = 0;
      return;
    }
    this.travel = {
      from: this.pos.clone(), to: p,
      fromYaw: this.yaw, toYaw: yaw, dYaw: shortestAngle(yaw - this.yaw),
      fromPitch: this.pitch, toPitch: pitch,
      fromFov: this.fov, toFov: PANO_FOV,
      t: 0, dur: seconds,
    };
  }

  /** 自由模式下把轨道参数对到一个机位上 */
  goToOrbit(pos, look, { animate = true, seconds = 1.4 } = {}) {
    const eye = new THREE.Vector3(...pos);
    const tgt = new THREE.Vector3(...look);
    const off = eye.clone().sub(tgt);
    const dist = clamp(off.length(), 10, 1400);
    const theta = Math.atan2(off.x, off.z);
    const phi = Math.acos(clamp(off.y / dist, -1, 1));
    const from = { t: this.target.clone(), d: this.dist, th: this.theta, ph: this.phi };
    if (!animate) {
      this.target.copy(tgt); this.dist = dist; this.theta = theta; this.phi = phi;
      return;
    }
    this.travel = {
      orbit: true, from, to: { t: tgt, d: dist, th: theta, ph: phi },
      dTh: shortestAngle(theta - this.theta), t: 0, dur: seconds,
    };
  }

  /** 全景模式里边看边挪脚（右键拖动）：沿地面平移视点，边界就是连岛这一圈 */
  nudge(moveX, moveY) {
    const k = this.fov / 2400;
    this.pos.addScaledVector(panRight(this.camera, 1), -moveX * k);
    this.pos.addScaledVector(panUp(this.camera, 1), moveY * k);
    this.pos.y = clamp(this.pos.y, BOUNDS.y0, BOUNDS.y1);
    this.pos.x = clamp(this.pos.x, BOUNDS.x0, BOUNDS.x1);
    this.pos.z = clamp(this.pos.z, BOUNDS.z0, BOUNDS.z1);
  }

  /**
   * 俯仰下限随眼睛离地的高度走：站在滩上、栈道上时不让人把视线压到近乎垂直，
   * 那样近裁剪面会插进滩地/栏板里，看到地形的背面；鸟瞰那档才允许俯视到底。
   */
  pitchFloor() {
    const y = this.pos.y;
    if (y > 60) return -1.45;
    if (y > 24) return -1.3;
    if (y > 9) return -1.12;
    return -0.95;
  }

  update(dt) {
    const k = this.keys;
    const spin = (k.has('arrowleft') ? 0.6 : 0) - (k.has('arrowright') ? 0.6 : 0);
    const tilt = (k.has('arrowup') ? 0.4 : 0) - (k.has('arrowdown') ? 0.4 : 0);
    this.vYaw += spin * dt; this.vPitch += tilt * dt;
    this.idle += dt;

    if (this.travel) {
      const tr = this.travel;
      tr.t = Math.min(1, tr.t + dt / tr.dur);
      const e = easeInOut(tr.t);
      if (tr.orbit) {
        this.target.lerpVectors(tr.from.t, tr.to.t, e);
        this.dist = THREE.MathUtils.lerp(tr.from.d, tr.to.d, e);
        this.theta = tr.from.th + tr.dTh * e;
        this.phi = THREE.MathUtils.lerp(tr.from.ph, tr.to.ph, e);
      } else {
        this.pos.lerpVectors(tr.from, tr.to, e);
        this.yaw = tr.fromYaw + tr.dYaw * e;
        this.pitch = THREE.MathUtils.lerp(tr.fromPitch, tr.toPitch, e);
        this.setFov(THREE.MathUtils.lerp(tr.fromFov, tr.toFov, e));
      }
      if (tr.t >= 1) {
        this.travel = null;
        if (this.onTravelEnd) this.onTravelEnd();
      }
      this.vYaw = this.vPitch = this.vTheta = this.vPhi = 0;
    } else {
      const damp = this.dragging ? 0.86 : 0.9;
      const idleSpin = this.autoRotate && this.idle > 1.2 ? 0.045 : 0;
      this.yaw += this.vYaw + idleSpin * dt;
      this.pitch = clamp(this.pitch + this.vPitch, this.pitchFloor(), 1.42);
      this.theta += this.vTheta;
      this.phi = clamp(this.phi + this.vPhi, 0.12, 1.5);
      this.vYaw *= damp; this.vPitch *= damp; this.vTheta *= damp; this.vPhi *= damp;
      if (Math.abs(this.vYaw) < 1e-5) this.vYaw = 0;
      if (Math.abs(this.vPitch) < 1e-5) this.vPitch = 0;
    }

    if (this.mode === 'pano') {
      this.camera.position.copy(this.pos);
      this._e.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this._e);
    } else {
      const s = Math.sin(this.phi);
      this.camera.position.set(
        this.target.x + this.dist * s * Math.sin(this.theta),
        this.target.y + this.dist * Math.cos(this.phi),
        this.target.z + this.dist * s * Math.cos(this.theta),
      );
      // 环绕时别把相机埋进平均海面以下：水下没有贴图，只会看到一片雾
      if (this.camera.position.y < 1.6) this.camera.position.y = 1.6;
      this.camera.lookAt(this.target);
    }
  }
}

const _tmp = new THREE.Vector3();
function panRight(camera, scale) {
  _tmp.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(scale);
  return _tmp.clone();
}
function panUp(camera, scale) {
  _tmp.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(scale);
  return _tmp.clone();
}
