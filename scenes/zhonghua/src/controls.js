import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const shortestAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

/**
 * Two camera behaviours sharing one code path:
 *  pano — eye sits at a station, drag turns the head (360°), wheel changes FOV
 *  free — orbit / dolly / pan around the quarter
 */
export class CameraRig {
  constructor(camera, el) {
    this.camera = camera;
    this.el = el;
    this.mode = 'pano';

    this.pos = new THREE.Vector3(-20.4, 4.4, -16);
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 62;

    this.target = new THREE.Vector3(0, 5, 0);
    this.dist = 150;
    this.theta = 0.5;
    this.phi = 1.06;

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

    this._bind();
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      // the pointer can already be gone by the time we hear about it; losing the
      // capture must not cost us the drag itself
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
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
        this.vYaw -= dx * 0.0026;
        this.vPitch -= dy * 0.0022;
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
    this.fov = clamp(v, 22, 96);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
  setDist(v) { this.dist = clamp(v, 6, 460); }

  /** yaw/pitch derived from a station pose; `look` is the point the eye is aimed at */
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
      fromFov: this.fov, toFov: 58,
      t: 0, dur: seconds,
    };
  }

  /** keep the free-orbit camera consistent with a station */
  goToOrbit(pos, look, { animate = true, seconds = 1.4 } = {}) {
    const eye = new THREE.Vector3(...pos);
    const tgt = new THREE.Vector3(...look);
    const off = eye.clone().sub(tgt);
    const dist = clamp(off.length(), 12, 460);
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

  /** slide the eye along the ground plane while looking around (right-drag in pano) */
  nudge(moveX, moveY) {
    const k = this.fov / 2400;
    this.pos.addScaledVector(panRight(this.camera, 1), -moveX * k);
    this.pos.addScaledVector(panUp(this.camera, 1), moveY * k);
    this.pos.y = clamp(this.pos.y, 1.6, 90);
    this.pos.x = clamp(this.pos.x, -170, 170);
    this.pos.z = clamp(this.pos.z, -190, 190);
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
      this.pitch = clamp(this.pitch + this.vPitch, -1.45, 1.45);
      this.theta += this.vTheta;
      this.phi = clamp(this.phi + this.vPhi, 0.12, 1.52);
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
