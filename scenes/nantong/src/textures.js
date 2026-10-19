import * as THREE from 'three';

const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

/** a tiling canvas whose texture space is `metersX` x `metersY` in world metres */
function tex(c, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* deterministic so the brickwork never re-shuffles between reloads */
const rnd = (() => {
  let s = 86293;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const WARM = ['255,236,198', '255,214,158', '255,246,224'];
const COOL = ['196,224,255', '168,206,255', '224,240,255'];

const scaleRgb = (hue, k) => {
  const [r, g, b] = hue.split(',').map((n) => Math.round(Number(n) * Math.min(1, k)));
  return `rgb(${r},${g},${b})`;
};

/* ------------------------------------------------------------------ utilities */

/** radial falloff — moon halo, star points, lamp glows, boat lanterns */
export function softGlow(hue = '200,225,255', hard = 0.12) {
  return memo(`glow-${hue}-${hard}`, () => {
    const { c, x } = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(hard, `rgba(${hue},0.72)`);
    g.addColorStop(0.45, `rgba(${hue},0.22)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c);
  });
}

export function noise() {
  return memo('noise', () => {
    const { c, x } = canvas(128, 128);
    const d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return tex(c, { srgb: false });
  });
}

/** vertical gradient for the light columns dragged down the water */
export function columnFade() {
  return memo('column', () => {
    const { c, x } = canvas(32, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    const s = x.createLinearGradient(0, 0, 32, 0);
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = s; x.fillRect(0, 0, 32, 128);
    return tex(c);
  });
}

export function edgeGlow() {
  return memo('edge', () => {
    const { c, x } = canvas(64, 16);
    const g = x.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 16);
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 墙体 */

/**
 * 砖墙，顺丁砌。canvas 覆盖 2.0 m x 1.4 m，八条砖缝，灰缝压暗、砖面提亮，
 * 加一层风化脏迹；夜间被上照灯斜打时，缝影是砖楼唯一还读得出来的细节。
 */
export function brick(base = '#5c5f66', face = '#7a7d84', { glaze = 0, courses = 8 } = {}) {
  return memo(`brick-${base}-${face}-${glaze}-${courses}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const ch = S / courses;
    for (let r = 0; r < courses; r++) {
      const y = r * ch;
      const bw = ch * 2.05;
      const off = (r % 2) * bw * 0.5;
      for (let bx = -bw; bx < S + bw; bx += bw) {
        const v = rnd();
        x.fillStyle = v > 0.72 ? face : base;
        x.globalAlpha = 0.55 + v * 0.45;
        x.fillRect(bx + off + 1.4, y + 1.4, bw - 2.8, ch - 2.8);
        // a chipped or soot-darkened brick now and then
        if (v < 0.12) {
          x.globalAlpha = 0.5;
          x.fillStyle = '#20242c';
          x.fillRect(bx + off + 1.4, y + ch * 0.55, bw - 2.8, ch * 0.42);
        }
      }
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(14,17,22,0.62)';
      x.fillRect(0, y, S, 1.7);
    }
    // 泛潮与烟尘：越往下越脏
    const gr = x.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(0,0,0,0.30)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.06)');
    gr.addColorStop(1, 'rgba(6,9,14,0.42)');
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      x.fillRect(rnd() * S, rnd() * S, 2.2, 2.2);
    }
    if (glaze > 0) {
      // 抹灰墙：把砖缝糊掉，只留隐约的格
      x.globalAlpha = 1 - glaze;
      x.fillStyle = face; x.fillRect(0, 0, S, S);
      x.globalAlpha = 1;
    }
    return tex(c, { repeat: [1 / 2.0, 1 / 1.4] });
  });
}

/** 石材砌块，用于台明、河岸驳岸与桥 */
export function ashlar(base = '#7e8288', face = '#9a9ea3') {
  return memo(`ashlar-${base}-${face}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const rows = 6, ch = S / rows;
    for (let r = 0; r < rows; r++) {
      const bw = ch * (1.5 + (r % 3) * 0.35);
      const off = (r % 2) * bw * 0.6;
      for (let bx = -bw; bx < S + bw; bx += bw) {
        const v = rnd();
        x.fillStyle = v > 0.5 ? face : base;
        x.globalAlpha = 0.5 + v * 0.5;
        x.fillRect(bx + off + 2, r * ch + 2, bw - 4, ch - 4);
        x.strokeStyle = 'rgba(0,0,0,0.3)';
        x.strokeRect(bx + off + 2, r * ch + 2, bw - 4, ch - 4);
      }
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      x.fillRect(rnd() * S, rnd() * S, 1.8, 1.8);
    }
    return tex(c, { repeat: [1 / 1.8, 1 / 1.8] });
  });
}

/** 竖向木板，用于门窗扇、码头铺地 */
export function boards(base = '#3a2c22', face = '#4d3c2f') {
  return memo(`boards-${base}-${face}`, () => {
    const S = 128, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? face : base;
      x.fillRect(i * 16 + 1, 0, 14, S);
      x.fillStyle = 'rgba(0,0,0,0.42)';
      x.fillRect(i * 16, 0, 1.4, S);
    }
    for (let i = 0; i < 600; i++) {
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(rnd() * S, rnd() * S, 1, 5 + rnd() * 12);
    }
    return tex(c, { repeat: [1 / 1.2, 1 / 1.6] });
  });
}

/** 铺地石板 */
export function paving(base = '#3c4250', scale = 1) {
  return memo(`pave-${base}-${scale}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4200; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
      x.fillRect(rnd() * 256, rnd() * 256, 1.7, 1.7);
    }
    x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 1.8;
    const n = 4;
    for (let k = 0; k <= n; k++) {
      x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke();
      x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke();
    }
    return tex(c, { repeat: [1 / (1.2 * scale), 1 / (1.2 * scale)] });
  });
}

/* ------------------------------------------------------------------ 屋面 */

/** 小青瓦：一行行仰瓦合瓦，夜里只剩密密的横向脊影 */
export function roofTile() {
  return memo('roofTile', () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = '#242a34'; x.fillRect(0, 0, S, S);
    const cols = 10, cw = S / cols;
    for (let i = 0; i < cols; i++) {
      const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
      g.addColorStop(0, 'rgba(10,13,18,0.85)');
      g.addColorStop(0.45, 'rgba(78,88,104,0.5)');
      g.addColorStop(0.62, 'rgba(104,116,134,0.55)');
      g.addColorStop(1, 'rgba(12,15,20,0.85)');
      x.fillStyle = g; x.fillRect(i * cw, 0, cw, S);
    }
    const rows = 12, ch = S / rows;
    for (let r = 0; r < rows; r++) {
      x.fillStyle = 'rgba(8,11,16,0.55)';
      x.fillRect(0, r * ch, S, 2.4);
      x.fillStyle = 'rgba(180,196,214,0.10)';
      x.fillRect(0, r * ch + 2.6, S, 1.6);
    }
    for (let i = 0; i < 800; i++) {
      x.fillStyle = rnd() > 0.6 ? 'rgba(120,150,120,0.06)' : 'rgba(0,0,0,0.1)';
      x.fillRect(rnd() * S, rnd() * S, 2.4, 2.4);
    }
    return tex(c, { repeat: [1 / 1.5, 1 / 1.5] });
  });
}

/** 白铁皮（锡铁）屋面，立缝一道一道 — 濠南别业 的红铁皮 */
export function seamRoof() {
  return memo('seamRoof', () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = '#5e2b21'; x.fillRect(0, 0, S, S);
    const cols = 8, cw = S / cols;
    for (let i = 0; i < cols; i++) {
      const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
      g.addColorStop(0, 'rgba(20,8,6,0.75)');
      g.addColorStop(0.3, 'rgba(140,72,54,0.5)');
      g.addColorStop(0.55, 'rgba(176,100,74,0.55)');
      g.addColorStop(1, 'rgba(28,11,8,0.8)');
      x.fillStyle = g; x.fillRect(i * cw, 0, cw, S);
    }
    for (let r = 0; r < 3; r++) {
      x.fillStyle = 'rgba(0,0,0,0.28)';
      x.fillRect(0, r * S / 3, S, 2);
    }
    for (let i = 0; i < 500; i++) {
      x.fillStyle = 'rgba(0,0,0,0.14)';
      x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return tex(c, { repeat: [1 / 2.4, 1 / 2.4] });
  });
}

/* ------------------------------------------------------------------ 窗光 */

/** 背景楼群的灯窗，用于环城 一带 的 多层与高层 */
export function cityWindows({ warm = 0.72, density = 0.42 } = {}) {
  return memo(`citywin-${warm.toFixed(2)}-${density.toFixed(2)}`, () => {
    const S = 128, { c, x } = canvas(S, S);
    const cols = 8, rows = 8, cw = S / cols, chh = S / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (rnd() > density) continue;
        const hue = rnd() < warm ? WARM[(rnd() * WARM.length) | 0] : COOL[(rnd() * COOL.length) | 0];
        x.fillStyle = scaleRgb(hue, 0.4 + rnd() * 0.6);
        x.fillRect(i * cw + cw * 0.2, j * chh + chh * 0.25, cw * 0.6, chh * 0.5);
      }
    }
    return tex(c, { repeat: [1 / 3.2, 1 / 3.4] });
  });
}

/** 老馆舍的 灯窗 mask：整幅墙面一张 canvas，不做 tiling。
 *  bays/floors 决定格数，arch 给西式楼的上圆窗，density 控制夜里还亮着几扇。 */
export function historicWindows({ bays = 5, floors = 2, arch = false, density = 0.28, warm = 0.85 } = {}) {  return memo(`hw-${bays}-${floors}-${arch}-${density}-${warm}`, () => {
    const S = 512, { c, x } = canvas(S, S);
    const bw = S / bays, bh = S / floors;
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const cx = b * bw, cy = S - (f + 1) * bh;
        const w = bw * 0.42, h = bh * 0.5;
        const px = cx + (bw - w) / 2, py = cy + bh * 0.24;
        if (arch) {
          x.fillStyle = 'rgba(10,14,20,0.9)';
          x.beginPath();
          x.moveTo(px, py + h); x.lineTo(px, py + w / 2);
          x.arc(px + w / 2, py + w / 2, w / 2, Math.PI, 0);
          x.lineTo(px + w, py + h); x.closePath(); x.fill();
        }
        if (rnd() < density) {
          const hue = rnd() < warm ? WARM[(rnd() * WARM.length) | 0] : COOL[(rnd() * COOL.length) | 0];
          x.fillStyle = scaleRgb(hue, 0.45 + rnd() * 0.55);
          x.fillRect(px + 2, py + 2, w - 4, h - 4);
        }
      }
    }
    return tex(c, { repeat: [1, 1] });
  });
}
