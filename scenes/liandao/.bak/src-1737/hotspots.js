import * as THREE from 'three';

/**
 * 热点层：海面上的灯环 + HTML 标签 + 水面参考网格。
 * 网格只是量尺度用的东西，永远压在主场景之下：贴当前潮面、随相机平移、按高度淡出。
 */

const RING = 128;
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = RING * 2;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(RING, RING, 34, RING, RING, RING - 4);
  g.addColorStop(0, 'rgba(150,214,255,0.42)');
  g.addColorStop(0.55, 'rgba(110,180,230,0.12)');
  g.addColorStop(1, 'rgba(90,160,215,0)');
  x.fillStyle = g; x.fillRect(0, 0, RING * 2, RING * 2);
  // 主环：月光白；外环：淡青，像浮筒落在水上的灯影
  x.strokeStyle = 'rgba(214,238,255,0.95)'; x.lineWidth = 6;
  x.beginPath(); x.arc(RING, RING, 70, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(150,205,240,0.28)'; x.lineWidth = 2.5;
  x.beginPath(); x.arc(RING, RING, 92, 0, 7); x.stroke();
  // 四个短刻度，读起来像罗经上的方位齿
  x.strokeStyle = 'rgba(255,214,150,0.85)'; x.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    x.beginPath();
    x.moveTo(RING + Math.cos(a) * 78, RING + Math.sin(a) * 78);
    x.lineTo(RING + Math.cos(a) * 88, RING + Math.sin(a) * 88);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,236,206,1)';
  x.beginPath(); x.arc(RING, RING, 13, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------ 水面参考网格 */
const GRID = {
  half: 600,        // 以相机为中心，四周各铺 600 米
  minor: 25,        // 细格 25 米
  major: 100,       // 主格 100 米
  seg: 25,          // 每条线切这么长一段，好把边缘的透明度做出来
  lift: 0.9,        // 浮在当前潮面之上这么多米：够躲开小 ripple，又仍贴着水
  // 中心点的取值范围（跟 controls.js 的 nudge 边界同一圈，略收）
  cx0: -1250, cx1: 720, cz0: -750, cz1: 1050,
};
const clamp = THREE.MathUtils.clamp;

/** 离中心越远越透明：过了 30% 半径开始收，到 96% 归零，地平线那头的密线就不织成一片了 */
function alphaAt(x, z) {
  const r = Math.hypot(x, z) / GRID.half;
  const t = clamp((r - 0.3) / 0.66, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * 世界轴对齐的水平线网。
 * skip 为真时把落在主格上的线让出去，两套线不叠。
 */
function gridGeo({ step, color, skip = null }) {
  const c = new THREE.Color(color);
  const pos = [];
  const col = [];
  const segN = Math.round((GRID.half * 2) / GRID.seg);
  const emit = (ax, az, bx, bz) => {
    for (let i = 0; i < segN; i++) {
      const t0 = i / segN, t1 = (i + 1) / segN;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      pos.push(x0, 0, z0, x1, 0, z1);
      col.push(c.r, c.g, c.b, alphaAt(x0, z0), c.r, c.g, c.b, alphaAt(x1, z1));
    }
  };
  const n = Math.round(GRID.half / step);
  for (let i = -n; i <= n; i++) {
    const v = i * step;
    if (skip && Math.abs(v % skip) < 1e-6) continue;
    emit(v, -GRID.half, v, GRID.half);      // 平行于 Z 的线
    emit(-GRID.half, v, GRID.half, v);      // 平行于 X 的线
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return geo;
}

const _v = new THREE.Vector3();

export class Hotspots {
  constructor(scene, stations, { onPick }) {
    this.scene = scene;
    this.stations = stations;
    this.onPick = onPick;
    this.map = new Map();
    this.current = null;
    this.labelsOn = true;
    this.gridVisible = true;

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
      sp.scale.set(0.03, 0.03, 1);
      sp.position.copy(p);
      sp.renderOrder = 20;
      sp.userData.station = s;
      this.grp.add(sp);
      this.map.set(s.id, { sprite: sp, anchor: p, phase: Math.random() * 6.28 });
    }
    scene.add(this.grp);

    /* ---- 网格：细格 + 主格，两套线，各自控制透明度 ---- */
    this.grid = new THREE.Group();
    this.grid.name = 'groundGrid';
    this._baseMajor = 0.22;
    this._baseMinor = 0.1;
    const mk = (geo, color, opacity) => {
      const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(color), vertexColors: true, transparent: true, opacity,
        depthWrite: false, fog: false, toneMapped: false,
      }));
      m.renderOrder = 6;
      return m;
    };
    this.gridMajor = mk(gridGeo({ step: GRID.major, color: '#9ed6ff' }), '#9ed6ff', this._baseMajor);
    this.gridMinor = mk(gridGeo({ step: GRID.minor, color: '#4b86b4', skip: GRID.major }), '#4b86b4', this._baseMinor);
    this.grid.add(this.gridMinor, this.gridMajor);
    scene.add(this.grid);

    /* ---- HTML 标签层 ---- */
    this.layer = document.createElement('div');
    this.layer.id = 'label-layer';
    this.layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5';
    document.body.appendChild(this.layer);
    for (const s of stations) {
      if (!s.mark) continue;
      const el = document.createElement('button');
      el.className = 'hs-label';
      el.innerHTML = `<i class="hs-dot"></i><span>${s.short}</span>`;
      el.title = s.name;
      el.addEventListener('click', () => this.onPick && this.onPick(s));
      this.layer.appendChild(el);
      this.map.get(s.id).label = el;
    }

    // 网格的比例说明，跟着这一层一起开关（室内特写时不显示）
    this.scaleNote = document.createElement('div');
    this.scaleNote.id = 'grid-note';
    this.scaleNote.className = 'grid-note';
    this.scaleNote.innerHTML = '<span class="gn-bar"></span>水面网格 <b>25</b> 米 · 主格 <b>100</b> 米<i>贴当前潮面，格点落世界整格</i>';
    document.body.appendChild(this.scaleNote);
  }

  set labelsVisible(v) {
    this.labelsOn = v;
    this.layer.style.display = v ? '' : 'none';
  }
  get labelsVisible() { return this.labelsOn; }

  /** 进了灯室、船舱这些特写空间之后，灯环、标签和水面网格都没有意义了 */
  set exteriorShown(v) {
    this.grp.visible = v;
    this.grid.visible = v && this.gridVisible;
    this.scaleNote.style.display = v ? '' : 'none';
    for (const h of this.map.values()) h.label.style.visibility = v ? '' : 'hidden';
  }

  setCurrent(id) {
    this.current = id;
    for (const [k, h] of this.map) {
      h.sprite.visible = k !== id;
      if (k === id) h.label.style.opacity = 0;
    }
  }

  update(camera, t, size) {
    const w = Math.max(1, size.width), h = Math.max(1, size.height);
    // sizeAttenuation:false 时 scale 是 NDC 单位，宽屏上圆环会被拉扁，按纵横比补回来
    const aspect = h / w;
    for (const [id, hs] of this.map) {
      const a = hs.anchor;
      const dist = camera.position.distanceTo(a);
      const pulse = 1 + 0.12 * Math.sin(t * 2.2 + hs.phase);
      const grow = 0.03 * pulse * (1 + Math.min(0.5, dist / 420));
      hs.sprite.scale.set(grow * aspect * 1.6, grow, 1);
      if (!this.labelsOn) continue;
      _v.copy(a).project(camera);
      const facing = _v.z < 1 && dist < 900;
      const on = facing && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
      const el = hs.label;
      if (id === this.current || !on) { el.style.opacity = 0; continue; }
      el.style.left = `${(_v.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-_v.y * 0.5 + 0.5) * h}px`;
      el.style.opacity = String(Math.max(0.3, 1 - dist / 760));
    }
    this._updateGrid(camera);
  }

  /** 网格永远是配角：贴潮面起落、跟着相机走、按眼睛的高度淡出 */
  _updateGrid(camera) {
    if (!this.grid.visible) return;
    // 潮位由 main.js 每帧算好并挂在 window.liandao.tide 上（本模块不起自己的时钟）
    const tide = (typeof window !== 'undefined' && window.liandao && window.liandao.tide) || null;
    const y = (tide ? tide.level : 0) + GRID.lift;
    const cx = clamp(Math.round(camera.position.x / GRID.major) * GRID.major, GRID.cx0, GRID.cx1);
    const cz = clamp(Math.round(camera.position.z / GRID.major) * GRID.major, GRID.cz0, GRID.cz1);
    this.grid.position.set(cx, y, cz);
    const eye = camera.position.y - y;                                  // 眼睛在格面以上多少米
    const near = clamp((eye - 0.3) / 1.1, 0, 1);                        // 贴脸时收掉，免得糊成一片
    const high = clamp(1.12 - eye / 420, 0.42, 1);                       // 鸟瞰时收到六成
    const k = near * high;
    const thin = clamp(1 - (eye - 40) / 170, 0, 1);                      // 细格先退，主格留下
    this.gridMajor.material.opacity = this._baseMajor * k;
    this.gridMinor.material.opacity = this._baseMinor * k * thin;
    const show = k > 0.02;
    this.gridMajor.visible = show;
    this.gridMinor.visible = show && thin > 0.02;
  }

  /**
   * 拾取：先按射线打灯环；打不中再退到屏幕距离最近的那个环
   * （sprite 用了 sizeAttenuation:false，射线对它的小包围盒不太可靠）
   */
  pick(ndc, camera) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(this.grp.children, false);
    for (const hs of hits) {
      if (hs.object.visible && hs.object.userData.station) return hs.object.userData.station;
    }
    let best = null, bd = 34;   // 34 px 容差
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    for (const [id, hs] of this.map) {
      if (id === this.current || !hs.sprite.visible) continue;
      _v.copy(hs.anchor).project(camera);
      if (_v.z > 1) continue;
      const px = Math.hypot((_v.x - ndc.x) * w * 0.5, (_v.y - ndc.y) * h * 0.5);
      if (px < bd) { bd = px; best = hs.sprite.userData.station; }
    }
    return best;
  }
}
