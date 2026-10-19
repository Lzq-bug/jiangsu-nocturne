import * as THREE from 'three';

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,206,150,0.5)');
  g.addColorStop(0.55, 'rgba(255,178,110,0.13)');
  g.addColorStop(1, 'rgba(255,170,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,238,214,0.95)'; x.lineWidth = 7;
  x.beginPath(); x.arc(128, 128, 74, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(255,226,190,0.3)'; x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 96, 0, 7); x.stroke();
  x.fillStyle = 'rgba(255,250,240,1)';
  x.beginPath(); x.arc(128, 128, 16, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _v = new THREE.Vector3();

/**
 * Landmark rings + HTML captions. `viewRange` scales the fade: a 6 m wide lane is
 * read at a twentieth of the distance of a lake, so the rings must not blind you
 * from across the water.
 */
export class Hotspots {
  constructor(scene, stations, { onPick, viewRange = 260 }) {
    this.scene = scene;
    this.stations = stations;
    this.onPick = onPick;
    this.map = new Map();
    this.current = null;
    this.labelsOn = true;
    this.range = viewRange;

    const tex = ringTexture();
    this.grp = new THREE.Group();
    this.grp.name = 'hotspots';
    for (const s of stations) {
      if (!s.mark) continue;
      const p = new THREE.Vector3(...s.mark);
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true, depthTest: false,
        blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: false,
      });
      mat.toneMapped = false;
      const sp = new THREE.Sprite(mat);
      sp.scale.set(0.05, 0.05, 1);
      sp.position.copy(p);
      sp.renderOrder = 20;
      sp.userData.station = s;
      this.grp.add(sp);
      this.map.set(s.id, { sprite: sp, anchor: p, phase: rand01() * 6.28 });
    }
    scene.add(this.grp);

    this.layer = document.createElement('div');
    this.layer.id = 'label-layer';
    this.layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5';
    document.body.appendChild(this.layer);
    for (const s of stations) {
      if (!s.mark) continue;
      const el = document.createElement('button');
      el.className = 'hs-label';
      el.textContent = s.short;
      el.addEventListener('click', () => this.onPick && this.onPick(s));
      this.layer.appendChild(el);
      this.map.get(s.id).label = el;
    }
  }

  set labelsVisible(v) {
    this.labelsOn = v;
    this.layer.style.display = v ? '' : 'none';
  }
  setCurrent(id) {
    this.current = id;
    for (const [k, h] of this.map) {
      h.sprite.visible = k !== id;
      if (k === id) h.label.style.opacity = 0;
    }
  }
  update(camera, t, size) {
    const half = new THREE.Vector2(size.width / 2, size.height / 2);
    for (const [id, h] of this.map) {
      if (id === this.current) continue;
      const a = h.anchor;
      const dist = camera.position.distanceTo(a);
      const pulse = 1 + 0.12 * Math.sin(t * 2.2 + h.phase);
      const sc = 0.05 * pulse * (1 + Math.min(0.6, dist / (this.range * 0.9)));
      h.sprite.scale.set(sc, sc, 1);
      if (!this.labelsOn) continue;
      _v.copy(a).project(camera);
      const facing = _v.z < 1 && dist < this.range;
      const on = facing && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
      const el = h.label;
      if (!on) { el.style.opacity = 0; continue; }
      el.style.left = `${(_v.x * 0.5 + 0.5) * half.x * 2}px`;
      el.style.top = `${(-_v.y * 0.5 + 0.5) * half.y * 2}px`;
      el.style.opacity = String(Math.max(0.25, 1 - dist / (this.range * 1.05)));
    }
  }
  pick(ndc, camera) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(this.grp.children, false);
    for (const h of hits) {
      if (h.object.visible && h.object.userData.station) return h.object.userData.station;
    }
    return null;
  }
}

let rs = 8123;
function rand01() {
  rs = (rs * 1103515245 + 12345) & 0x7fffffff;
  return rs / 0x7fffffff;
}
