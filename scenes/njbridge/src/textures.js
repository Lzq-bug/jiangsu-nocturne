/** Procedural canvas textures — no image assets, everything is drawn at boot. */
import * as THREE from 'three';

const cvs = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

function mk(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** deterministic in-texture noise so the maps don't shimmer between reloads */
let s = 99991;
function r2() {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ 通用 */

export function noise({ size = 256 } = {}) {
  const c = cvs(size, size);
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (r2() - 0.5) * 150;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return mk(c, { srgb: false });
}

/** radial falloff used by every additive halo */
export function softGlow(hue = '255,228,190', hard = 0.1) {
  const c = cvs(128, 128);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 64 * hard, 64, 64, 64);
  g.addColorStop(0, `rgba(${hue},0.95)`);
  g.addColorStop(0.35, `rgba(${hue},0.35)`);
  g.addColorStop(0.7, `rgba(${hue},0.08)`);
  g.addColorStop(1, `rgba(${hue},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return mk(c);
}

/** vertical light column in water: bright at the top, frayed at the bottom */
export function columnFade() {
  const c = cvs(64, 256);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  for (let i = 0; i < 220; i++) {
    const u = r2();
    const w = 3 + r2() * 9;
    const y = u * 256;
    x.globalAlpha = 0.05 + r2() * 0.1;
    x.fillRect(6 + u * 46 - w / 2, y, w, 6 + r2() * 20);
  }
  x.globalAlpha = 1;
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(20, 0); x.lineTo(44, 0); x.lineTo(52, 256); x.lineTo(12, 256);
  x.closePath(); x.fill();
  return mk(c, { srgb: false });
}

/* ------------------------------------------------------------------ 混凝土与钢 */

/**
 * 混凝土：色斑 + 模板缝 + 水痕。streak 越大越像被雨水洗过的桥墩。
 */
export function concrete({ meters = 4, base = '#6b7178', streak = 0.3 } = {}) {
  const c = cvs(512, 512);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const px = r2() * 512, py = r2() * 512;
    const k = r2();
    x.fillStyle = `rgba(${k > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r2() * 0.05})`;
    x.beginPath();
    x.arc(px, py, 1 + r2() * 12, 0, 7);
    x.fill();
  }
  // 模板分缝
  x.strokeStyle = 'rgba(0,0,0,0.2)';
  x.lineWidth = 2;
  const step = 512 / 4;
  for (let i = 1; i < 4; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(512, i * step); x.stroke();
  }
  // 水痕
  for (let i = 0; i < 90 * streak; i++) {
    const px = r2() * 512;
    x.fillStyle = `rgba(10,16,20,${0.05 + r2() * 0.14 * streak})`;
    x.fillRect(px, r2() * 300, 1 + r2() * 4, 80 + r2() * 380);
  }
  const t = mk(c);
  t.repeat.set(1 / meters, 1 / meters);
  return t;
}

/** 铆合钢板：横向板缝 + 铆钉列 */
export function riveted({ meters = 3.6 } = {}) {
  const c = cvs(512, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#4b5566';
  x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${r2() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r2() * 0.05})`;
    x.fillRect(r2() * 512, r2() * 256, 2 + r2() * 22, 1 + r2() * 5);
  }
  x.strokeStyle = 'rgba(0,0,0,0.32)';
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * 256;
    x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke();
  }
  x.fillStyle = 'rgba(226,232,240,0.5)';
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * 256;
    for (let k = 0; k < 40; k++) {
      x.beginPath();
      x.arc((k + 0.5) * 12.8, y - 7, 2.1, 0, 7);
      x.fill();
    }
  }
  const t = mk(c);
  t.repeat.set(1 / meters, 1 / (meters * 0.5));
  return t;
}

/** 钢板梁腹：加劲肋 */
export function deckPlate() {
  const c = cvs(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#3b424c';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  x.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const px = i * 32;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke();
  }
  x.strokeStyle = 'rgba(210,220,232,0.22)';
  x.lineWidth = 1.4;
  for (let i = 0; i < 8; i++) {
    const px = i * 32 + 4;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke();
  }
  return mk(c);
}

/* ------------------------------------------------------------------ 桥面 */

export function asphalt() {
  const c = cvs(512, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#242a31';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i++) {
    x.fillStyle = `rgba(${r2() > 0.6 ? '255,255,255' : '0,0,0'},${0.02 + r2() * 0.06})`;
    x.fillRect(r2() * 512, r2() * 512, 1 + r2() * 4, 1 + r2() * 4);
  }
  // 车道分界：15 米车行道四车道 → 三条虚线 + 两侧实线
  x.fillStyle = 'rgba(236,238,232,0.72)';
  x.fillRect(512 * 0.02, 0, 5, 512);
  x.fillRect(512 * 0.98 - 5, 0, 5, 512);
  for (let lane = 1; lane < 4; lane++) {
    const px = (lane / 4) * 512;
    for (let d = 0; d < 512; d += 46) x.fillRect(px - 2, d, 4, 26);
  }
  return mk(c);
}

/** 铁路道床：砟石 + 枕木（枕木沿 v 方向重复） */
export function ballast() {
  const c = cvs(256, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#4e4a46';
  x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 4200; i++) {
    const k = r2();
    x.fillStyle = `rgba(${k > 0.5 ? '235,235,230' : '20,18,16'},${0.05 + r2() * 0.16})`;
    x.beginPath();
    x.arc(r2() * 256, r2() * 512, 1 + r2() * 3.4, 0, 7);
    x.fill();
  }
  x.fillStyle = '#2a2521';
  for (let i = 0; i < 512; i += 17) x.fillRect(6, i, 244, 9);
  return mk(c);
}

export function paving({ meters = 2.4, base = '#767d84' } = {}) {
  const c = cvs(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  const n = 4;
  x.strokeStyle = 'rgba(0,0,0,0.26)';
  x.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    x.beginPath(); x.moveTo((i / n) * 256, 0); x.lineTo((i / n) * 256, 256); x.stroke();
    x.beginPath(); x.moveTo(0, (i / n) * 256); x.lineTo(256, (i / n) * 256); x.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${r2() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r2() * 0.05})`;
    x.fillRect(r2() * 256, r2() * 256, 2, 2);
  }
  const t = mk(c);
  t.repeat.set(1 / meters, 1 / meters);
  return t;
}

/* ------------------------------------------------------------------ 堡身石面 */

/** 桥头堡的石材墙面：横顺砌 + 竖向长窗的暗带 */
export function stoneFacade({ meters = 3.4, windows = true } = {}) {
  const c = cvs(512, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#b3b3a6';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = `rgba(${r2() > 0.5 ? '255,255,255' : '60,54,40'},${0.02 + r2() * 0.06})`;
    x.fillRect(r2() * 512, r2() * 512, 3 + r2() * 16, 2 + r2() * 6);
  }
  x.strokeStyle = 'rgba(70,66,56,0.35)';
  x.lineWidth = 1.6;
  for (let i = 0; i < 16; i++) {
    const y = i * 32;
    x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke();
    for (let k = 0; k < 8; k++) {
      const px = k * 64 + (i % 2) * 32;
      x.beginPath(); x.moveTo(px, y); x.lineTo(px, y + 32); x.stroke();
    }
  }
  if (windows) {
    // 塔楼的竖向窗带：夜里从里面透出一点暖光
    x.fillStyle = 'rgba(18,22,28,0.92)';
    for (let k = 0; k < 4; k++) x.fillRect(74 + k * 106, 40, 26, 432);
    x.fillStyle = 'rgba(255,206,150,0.5)';
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 12; j++) {
        if (r2() > 0.45) x.fillRect(78 + k * 106, 52 + j * 36, 18, 12);
      }
    }
  }
  const t = mk(c);
  t.repeat.set(1 / meters, 1 / meters);
  return t;
}

/* ------------------------------------------------------------------ 栏板浮雕 */

/**
 * 三类浮雕：镂空向日葵 98 / 风景主题 98 / 红旗齿轮麦穗 6。
 * 图样按题材通例画，非写实摹本（写意）。
 */
export function relief(kind = 'sun') {
  const c = cvs(512, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#7f858a';
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = 'rgba(30,36,42,0.55)';
  x.lineWidth = 3;
  x.strokeRect(14, 14, 484, 228);

  const hi = 'rgba(226,232,236,0.62)';
  const lo = 'rgba(24,30,36,0.5)';
  if (kind === 'sun') {
    // 向日葵：一朵居中，两侧各半朵，花瓣镂空
    const head = (cx, cy, r) => {
      x.save();
      x.translate(cx, cy);
      for (let i = 0; i < 16; i++) {
        x.rotate((Math.PI * 2) / 16);
        x.fillStyle = hi;
        x.beginPath();
        x.ellipse(0, -r * 0.72, r * 0.2, r * 0.44, 0, 0, 7);
        x.fill();
        x.fillStyle = lo;
        x.beginPath();
        x.ellipse(0, -r * 0.74, r * 0.12, r * 0.3, 0, 0, 7);
        x.fill();
      }
      x.fillStyle = hi;
      x.beginPath(); x.arc(0, 0, r * 0.34, 0, 7); x.fill();
      x.fillStyle = lo;
      x.beginPath(); x.arc(0, 0, r * 0.24, 0, 7); x.fill();
      x.restore();
    };
    head(256, 128, 96);
    head(34, 138, 54);
    head(478, 138, 54);
    x.strokeStyle = hi; x.lineWidth = 5;
    x.beginPath(); x.moveTo(256, 220); x.lineTo(256, 190); x.stroke();
  } else if (kind === 'scene') {
    // 风景：远山、水、电线杆与一层云
    x.fillStyle = lo;
    x.beginPath();
    x.moveTo(20, 150); x.lineTo(120, 78); x.lineTo(210, 146); x.lineTo(320, 92);
    x.lineTo(430, 152); x.lineTo(492, 120); x.lineTo(492, 200); x.lineTo(20, 200);
    x.closePath(); x.fill();
    x.strokeStyle = hi; x.lineWidth = 4;
    x.beginPath(); x.moveTo(20, 150); x.lineTo(120, 78); x.lineTo(210, 146); x.stroke();
    x.beginPath(); x.moveTo(320, 92); x.lineTo(430, 152); x.stroke();
    for (let i = 0; i < 5; i++) {
      const px = 60 + i * 100;
      x.strokeStyle = hi; x.lineWidth = 3;
      x.beginPath(); x.moveTo(px, 200); x.lineTo(px, 168); x.stroke();
      x.beginPath(); x.moveTo(px - 12, 174); x.lineTo(px + 12, 174); x.stroke();
    }
    x.strokeStyle = lo; x.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      x.beginPath(); x.moveTo(20, 186 + i * 5); x.lineTo(492, 186 + i * 5); x.stroke();
    }
  } else {
    // 工农兵：红旗 + 齿轮 + 麦穗
    x.fillStyle = hi;
    x.beginPath();
    x.moveTo(120, 60); x.lineTo(300, 84); x.lineTo(120, 108); x.closePath(); x.fill();
    x.fillStyle = lo;
    x.fillRect(114, 52, 10, 156);
    x.strokeStyle = hi; x.lineWidth = 7;
    x.beginPath(); x.arc(330, 150, 54, 0, 7); x.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      x.beginPath();
      x.moveTo(330 + Math.cos(a) * 54, 150 + Math.sin(a) * 54);
      x.lineTo(330 + Math.cos(a) * 68, 150 + Math.sin(a) * 68);
      x.stroke();
    }
    x.strokeStyle = hi; x.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      const py = 96 + i * 22;
      x.beginPath(); x.moveTo(420, py); x.lineTo(460, py - 10); x.stroke();
      x.beginPath(); x.moveTo(420, py); x.lineTo(460, py + 4); x.stroke();
    }
    x.beginPath(); x.moveTo(430, 210); x.lineTo(430, 96); x.stroke();
  }
  // 统一压一层做旧
  for (let i = 0; i < 1200; i++) {
    x.fillStyle = `rgba(0,0,0,${0.02 + r2() * 0.05})`;
    x.fillRect(r2() * 512, r2() * 256, 2 + r2() * 8, 2);
  }
  return mk(c);
}

/* ------------------------------------------------------------------ 今市 */

/** 楼的立面：窗格点灯，密度低才像深夜 */
export function cityFacade({ cols = 7, rows = 6, density = 0.2 } = {}) {
  const c = cvs(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#20272f';
  x.fillRect(0, 0, 256, 256);
  const cw = 256 / cols, ch = 256 / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const on = r2() < density;
      x.fillStyle = on
        ? `rgba(${230 + r2() * 25},${190 + r2() * 40},${130 + r2() * 60},${0.5 + r2() * 0.5})`
        : 'rgba(12,16,21,0.85)';
      x.fillRect(i * cw + cw * 0.24, j * ch + ch * 0.22, cw * 0.5, ch * 0.42);
    }
  }
  return mk(c);
}
